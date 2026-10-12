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

      if (scrobble?.ignoredMessage?.code !== '0') {
        return { success: true, ignored: true };
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

export async function processScrobbleQueue() {
  if (scrobbleWorkerRunning) return;
  scrobbleWorkerRunning = true;

  try {
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
  } catch (e) {
    console.error('Error in scrobble queue processor:', e);
  } finally {
    scrobbleWorkerRunning = false;
  }
}
