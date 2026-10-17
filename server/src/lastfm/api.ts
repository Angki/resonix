import crypto from 'crypto';
import { config } from '../config.js';
import { prisma } from '../db.js';
import { decryptSecret, encryptSecret } from '../crypto.js';

const LASTFM_API_ROOT = 'https://ws.audioscrobbler.com/2.0/';

export function generateApiSignature(params: Record<string, string>, secret: string): string {
  const sortedKeys = Object.keys(params)
    .filter(k => k !== 'format' && k !== 'callback')
    .sort();

  let sigString = '';
  for (const k of sortedKeys) {
    sigString += k + params[k];
  }
  sigString += secret;

  return crypto.createHash('md5').update(sigString, 'utf8').digest('hex');
}

export async function getLastFmCredentials() {
  const apiKeySetting = await prisma.setting.findUnique({ where: { key: 'lastFmApiKey' } });
  const apiSecretSetting = await prisma.setting.findUnique({ where: { key: 'lastFmApiSecret' } });

  const apiKey = apiKeySetting?.value || config.LASTFM_API_KEY || '';
  const apiSecret = apiSecretSetting?.value || config.LASTFM_API_SECRET || '';

  return { apiKey, apiSecret };
}

export async function requestLastFmToken(): Promise<{ token: string; authUrl: string } | null> {
  const { apiKey, apiSecret } = await getLastFmCredentials();
  if (!apiKey || !apiSecret) return null;

  const params: Record<string, string> = {
    method: 'auth.getToken',
    api_key: apiKey,
  };
  const apiSig = generateApiSignature(params, apiSecret);
  const query = new URLSearchParams({ ...params, api_sig: apiSig, format: 'json' });

  try {
    const res = await fetch(`${LASTFM_API_ROOT}?${query.toString()}`);
    const data = (await res.json()) as any;
    if (data.token) {
      const authUrl = `https://www.last.fm/api/auth/?api_key=${apiKey}&token=${data.token}`;
      return { token: data.token, authUrl };
    }
  } catch (e) {
    console.error('Last.fm request token failed:', e);
  }
  return null;
}

export async function exchangeTokenForSession(token: string): Promise<{ username: string; sessionKey: string } | null> {
  const { apiKey, apiSecret } = await getLastFmCredentials();
  if (!apiKey || !apiSecret) return null;

  const params: Record<string, string> = {
    method: 'auth.getSession',
    api_key: apiKey,
    token,
  };
  const apiSig = generateApiSignature(params, apiSecret);
  const query = new URLSearchParams({ ...params, api_sig: apiSig, format: 'json' });

  try {
    const res = await fetch(`${LASTFM_API_ROOT}?${query.toString()}`);
    const data = (await res.json()) as any;
    if (data.session && data.session.key) {
      return {
        username: data.session.name,
        sessionKey: data.session.key,
      };
    }
  } catch (e) {
    console.error('Last.fm token exchange failed:', e);
  }
  return null;
}

export async function getMobileSession(
  username: string,
  password: string
): Promise<{ username: string; sessionKey: string } | null> {
  const { apiKey, apiSecret } = await getLastFmCredentials();
  if (!apiKey || !apiSecret) return null;

  const params: Record<string, string> = {
    method: 'auth.getMobileSession',
    api_key: apiKey,
    username,
    password,
  };
  const apiSig = generateApiSignature(params, apiSecret);

  try {
    const res = await fetch(LASTFM_API_ROOT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ ...params, api_sig: apiSig, format: 'json' }).toString(),
    });
    const data = (await res.json()) as any;
    if (data.session && data.session.key) {
      return {
        username: data.session.name,
        sessionKey: data.session.key,
      };
    }
    if (data.message) {
      console.error('Last.fm getMobileSession error:', data.message);
    }
  } catch (e) {
    console.error('Last.fm mobile session request failed:', e);
  }
  return null;
}

export async function updateNowPlaying(
  sessionKey: string,
  artist: string,
  track: string,
  album?: string
): Promise<boolean> {
  const { apiKey, apiSecret } = await getLastFmCredentials();
  if (!apiKey || !apiSecret) return false;

  const params: Record<string, string> = {
    method: 'track.updateNowPlaying',
    api_key: apiKey,
    sk: sessionKey,
    artist,
    track,
    ...(album ? { album } : {}),
  };
  const apiSig = generateApiSignature(params, apiSecret);

  try {
    const res = await fetch(LASTFM_API_ROOT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ ...params, api_sig: apiSig, format: 'json' }).toString(),
    });
    const data = (await res.json()) as any;
    return !!data.nowplaying;
  } catch {
    return false;
  }
}

export async function submitScrobble(
  sessionKey: string,
  artist: string,
  track: string,
  timestamp: number,
  album?: string
): Promise<{ success: boolean; ignored?: boolean; error?: string }> {
  const { apiKey, apiSecret } = await getLastFmCredentials();
  if (!apiKey || !apiSecret) return { success: false, error: 'Missing Last.fm credentials' };

  const params: Record<string, string> = {
    method: 'track.scrobble',
    api_key: apiKey,
    sk: sessionKey,
    artist,
    track,
    timestamp: timestamp.toString(),
    ...(album ? { album } : {}),
  };
  const apiSig = generateApiSignature(params, apiSecret);

  try {
    const res = await fetch(LASTFM_API_ROOT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ ...params, api_sig: apiSig, format: 'json' }).toString(),
    });
    const data = (await res.json()) as any;

    if (data.scrobbles) {
      const scrobble = Array.isArray(data.scrobbles.scrobble)
        ? data.scrobbles.scrobble[0]
        : data.scrobbles.scrobble;

      const ignoredCode = scrobble?.ignoredMessage?.code;
      if (ignoredCode && String(ignoredCode) !== '0') {
        return {
          success: true,
          ignored: true,
          error: scrobble?.ignoredMessage?.['#text'] || `Ignored by Last.fm (code ${ignoredCode})`,
        };
      }
      return { success: true };
    }


    return { success: false, error: data.message || 'Scrobble submission failed' };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

// Background durable scrobble queue processor
let scrobbleWorkerRunning = false;
let rerunRequested = false;

export async function processScrobbleQueue() {
  if (scrobbleWorkerRunning) {
    rerunRequested = true;
    return;
  }
  scrobbleWorkerRunning = true;

  try {
    do {
      rerunRequested = false;
      const pendingJobs = await prisma.scrobbleJob.findMany({
        where: {
          status: 'pending',
          OR: [
            { nextRetryAt: null },
            { nextRetryAt: { lte: new Date() } },
          ],
        },
        take: 20,
        orderBy: { createdAt: 'asc' },
      });

      if (pendingJobs.length === 0) break;

    for (const job of pendingJobs) {
      const account = await prisma.lastFmAccount.findUnique({
        where: { userId: job.userId },
      });

      if (!account || !account.isScrobblingEnabled) {
        await prisma.scrobbleJob.update({
          where: { id: job.id },
          data: { status: 'ignored', errorMessage: 'Last.fm disabled or account unlinked' },
        });
        continue;
      }

      const sessionKey = decryptSecret(account.sessionKeyEncrypted);
      if (!sessionKey) {
        await prisma.scrobbleJob.update({
          where: { id: job.id },
          data: { status: 'failed', errorMessage: 'Unable to decrypt Last.fm session key' },
        });
        continue;
      }

      const result = await submitScrobble(
        sessionKey,
        job.artist,
        job.trackTitle,
        job.timestamp,
        job.albumTitle || undefined
      );

      if (result.success) {
        await prisma.scrobbleJob.update({
          where: { id: job.id },
          data: {
            status: result.ignored ? 'ignored' : 'submitted',
            errorMessage: result.ignored ? 'Ignored by Last.fm' : null,
          },
        });
      } else {
        const nextRetryCount = job.retryCount + 1;
        if (nextRetryCount >= 5) {
          await prisma.scrobbleJob.update({
            where: { id: job.id },
            data: { status: 'failed', retryCount: nextRetryCount, errorMessage: result.error },
          });
        } else {
          // Exponential backoff: 30s, 2m, 8m, 32m
          const delayMs = Math.pow(4, nextRetryCount) * 1000 * 10;
          await prisma.scrobbleJob.update({
            where: { id: job.id },
            data: {
              retryCount: nextRetryCount,
              nextRetryAt: new Date(Date.now() + delayMs),
              errorMessage: result.error,
            },
          });
        }
      }
      }
    } while (rerunRequested);
  } catch (e) {
    console.error('Error in scrobble queue processor:', e);
  } finally {
    scrobbleWorkerRunning = false;
  }
}

/**
 * Fetch track metadata and user play count from Last.fm
 */
export async function getTrackInfo(
  artist: string,
  track: string,
  username?: string
): Promise<{ userPlayCount: number; listeners: number; playCount: number; userLoved: boolean } | null> {
  const { apiKey } = await getLastFmCredentials();
  if (!apiKey) return null;

  const params: Record<string, string> = {
    method: 'track.getInfo',
    api_key: apiKey,
    artist,
    track,
    autocorrect: '1',
    format: 'json',
    ...(username ? { username } : {}),
  };

  try {
    const query = new URLSearchParams(params);
    const res = await fetch(`${LASTFM_API_ROOT}?${query.toString()}`);
    const text = await res.text();
    if (!res.ok) {
      console.warn(`Last.fm track.getInfo HTTP ${res.status} for ${artist} - ${track}: ${text.slice(0, 100)}`);
      return null;
    }
    let data: any;
    try {
      data = JSON.parse(text);
    } catch {
      console.warn(`Last.fm response for ${artist} - ${track} not JSON: ${text.slice(0, 100)}`);
      return null;
    }

    if (data?.track) {
      const userPlayCount = data.track.userplaycount ? parseInt(data.track.userplaycount, 10) : 0;
      const listeners = data.track.listeners ? parseInt(data.track.listeners, 10) : 0;
      const playCount = data.track.playcount ? parseInt(data.track.playcount, 10) : 0;
      const userLoved = data.track.userloved === '1';
      return {
        userPlayCount: isNaN(userPlayCount) ? 0 : userPlayCount,
        listeners: isNaN(listeners) ? 0 : listeners,
        playCount: isNaN(playCount) ? 0 : playCount,
        userLoved,
      };
    }
  } catch (e) {
    console.error(`Failed to fetch Last.fm info for ${artist} - ${track}:`, e);
  }
  return null;
}

/**
 * Fetch a user's all-time top tracks from Last.fm
 */
export async function getUserTopTracks(
  username: string,
  limit = 500,
  page = 1
): Promise<Array<{ title: string; artist: string; playCount: number }> | null> {
  const { apiKey } = await getLastFmCredentials();
  if (!apiKey) return null;

  const params: Record<string, string> = {
    method: 'user.getTopTracks',
    api_key: apiKey,
    user: username,
    period: 'overall',
    limit: Math.min(1000, limit).toString(),
    page: page.toString(),
    format: 'json',
  };

  try {
    const query = new URLSearchParams(params);
    const res = await fetch(`${LASTFM_API_ROOT}?${query.toString()}`);
    const text = await res.text();
    if (!res.ok) {
      console.warn(`Last.fm user.getTopTracks HTTP ${res.status}: ${text.slice(0, 100)}`);
      return null;
    }
    let data: any;
    try {
      data = JSON.parse(text);
    } catch {
      console.warn(`Last.fm user.getTopTracks not JSON: ${text.slice(0, 100)}`);
      return null;
    }

    const rawTracks = data?.toptracks?.track;
    if (Array.isArray(rawTracks)) {
      return rawTracks.map((t: any) => ({
        title: t.name || '',
        artist: t.artist?.name || '',
        playCount: parseInt(t.playcount, 10) || 0,
      }));
    }
  } catch (e) {
    console.error('Failed to fetch user top tracks from Last.fm:', e);
  }
  return null;
}

