import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { encryptSecret } from '../crypto.js';
import {
  requestLastFmToken,
  exchangeTokenForSession,
  getMobileSession,
  processScrobbleQueue,
  getLastFmCredentials,
  getTrackInfo,
  getUserTopTracks,
} from '../lastfm/api.js';

export async function lastFmRoutes(app: FastifyInstance) {
  app.get('/status', async (req, reply) => {
    const userId = req.user?.id;
    if (!userId) return reply.status(401).send({ error: 'Auth required' });

    const account = await prisma.lastFmAccount.findUnique({
      where: { userId },
    });

    const { apiKey } = await getLastFmCredentials();

    const pendingCount = await prisma.scrobbleJob.count({
      where: { userId, status: 'pending' },
    });

    const recentJobs = await prisma.scrobbleJob.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    return {
      hasApiKeysConfigured: !!apiKey,
      isConnected: !!account,
      username: account?.username || null,
      isScrobblingEnabled: account?.isScrobblingEnabled ?? false,
      pendingCount,
      recentJobs,
    };
  });

  app.get('/auth-url', async (req, reply) => {
    const result = await requestLastFmToken();
    if (!result) {
      return reply.status(400).send({
        error: 'Unable to request Last.fm auth token. Please ensure LASTFM_API_KEY and LASTFM_API_SECRET are set in Settings or .env',
      });
    }
    return result;
  });

  app.post('/callback', async (req, reply) => {
    const userId = req.user?.id;
    if (!userId) return reply.status(401).send({ error: 'Auth required' });

    const { token } = req.body as { token: string };
    if (!token) return reply.status(400).send({ error: 'Token is required' });

    const session = await exchangeTokenForSession(token);
    if (!session) {
      return reply.status(400).send({ error: 'Failed to exchange token for Last.fm session' });
    }

    const encryptedKey = encryptSecret(session.sessionKey);

    await prisma.lastFmAccount.upsert({
      where: { userId },
      update: {
        username: session.username,
        sessionKeyEncrypted: encryptedKey,
        isScrobblingEnabled: true,
        updatedAt: new Date(),
      },
      create: {
        userId,
        username: session.username,
        sessionKeyEncrypted: encryptedKey,
        isScrobblingEnabled: true,
      },
    });

    return {
      success: true,
      username: session.username,
    };
  });

  app.post('/login', async (req, reply) => {
    const userId = req.user?.id;
    if (!userId) return reply.status(401).send({ error: 'Auth required' });

    const { username, password } = req.body as { username?: string; password?: string };
    if (!username || !password) {
      return reply.status(400).send({ error: 'Username and password are required' });
    }

    const session = await getMobileSession(username, password);
    if (!session) {
      return reply.status(400).send({
        error: 'Failed to authenticate with Last.fm. Check your username, password, or API credentials.',
      });
    }

    const encryptedKey = encryptSecret(session.sessionKey);
    const encryptedPass = encryptSecret(password);

    await prisma.lastFmAccount.upsert({
      where: { userId },
      update: {
        username: session.username,
        sessionKeyEncrypted: encryptedKey,
        isScrobblingEnabled: true,
        compatUsername: username,
        compatPasswordEncrypted: encryptedPass,
        updatedAt: new Date(),
      },
      create: {
        userId,
        username: session.username,
        sessionKeyEncrypted: encryptedKey,
        isScrobblingEnabled: true,
        compatUsername: username,
        compatPasswordEncrypted: encryptedPass,
      },
    });

    return {
      success: true,
      username: session.username,
    };
  });

  app.post('/disconnect', async (req, reply) => {
    const userId = req.user?.id;
    if (!userId) return reply.status(401).send({ error: 'Auth required' });

    await prisma.lastFmAccount.deleteMany({
      where: { userId },
    });

    return { success: true };
  });

  app.post('/toggle-scrobble', async (req, reply) => {
    const userId = req.user?.id;
    if (!userId) return reply.status(401).send({ error: 'Auth required' });

    const account = await prisma.lastFmAccount.findUnique({
      where: { userId },
    });
    if (!account) return reply.status(400).send({ error: 'No Last.fm account connected' });

    const updated = await prisma.lastFmAccount.update({
      where: { userId },
      data: { isScrobblingEnabled: !account.isScrobblingEnabled },
    });

    return { isScrobblingEnabled: updated.isScrobblingEnabled };
  });

  app.post('/process-queue', async () => {
    await processScrobbleQueue();
    return { success: true };
  });

  // Sync play counts for all tracks in an album from Last.fm
  app.post('/sync-album', async (req, reply) => {
    const userId = req.user?.id;
    if (!userId) return reply.status(401).send({ error: 'Auth required' });

    const account = await prisma.lastFmAccount.findUnique({
      where: { userId },
    });
    if (!account?.username) {
      return reply.status(400).send({ error: 'No Last.fm account linked. Connect Last.fm in Settings first.' });
    }

    const bodySchema = z.object({
      albumId: z.string().min(1),
    });
    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.issues[0].message });
    }

    const tracks = await prisma.track.findMany({
      where: { albumId: parsed.data.albumId },
      select: { id: true, title: true, artistName: true },
    });

    if (tracks.length === 0) {
      return { success: true, totalTracks: 0, syncedCount: 0, updates: [] };
    }

    let syncedCount = 0;
    const updates: Array<{ trackId: string; playCount: number }> = [];

    for (const t of tracks) {
      try {
        const info = await getTrackInfo(t.artistName, t.title, account.username);
        if (info && info.userPlayCount > 0) {
          await prisma.userTrackStats.upsert({
            where: { userId_trackId: { userId, trackId: t.id } },
            update: {
              playCount: info.userPlayCount,
              ...(info.userLoved ? { isFavorite: true } : {}),
            },
            create: {
              userId,
              trackId: t.id,
              playCount: info.userPlayCount,
              isFavorite: info.userLoved,
            },
          });

          await prisma.externalTrackStats.upsert({
            where: { trackId_source: { trackId: t.id, source: 'lastfm' } },
            update: {
              originalPlayCount: info.userPlayCount,
              importedAt: new Date(),
            },
            create: {
              trackId: t.id,
              source: 'lastfm',
              originalFilePath: '',
              originalPlayCount: info.userPlayCount,
            },
          });

          syncedCount++;
          updates.push({ trackId: t.id, playCount: info.userPlayCount });
        }
      } catch (err) {
        console.warn(`Failed to sync Last.fm play count for track ${t.id}:`, err);
      }
      // Gentle pause to respect Last.fm rate limits
      await new Promise(r => setTimeout(r, 80));
    }

    return {
      success: true,
      totalTracks: tracks.length,
      syncedCount,
      updates,
    };
  });

  // Sync play counts for all tracks by an artist from Last.fm
  app.post('/sync-artist', async (req, reply) => {
    const userId = req.user?.id;
    if (!userId) return reply.status(401).send({ error: 'Auth required' });

    const account = await prisma.lastFmAccount.findUnique({
      where: { userId },
    });
    if (!account?.username) {
      return reply.status(400).send({ error: 'No Last.fm account linked. Connect Last.fm in Settings first.' });
    }

    const bodySchema = z.object({
      artistId: z.string().min(1),
      rootId: z.string().optional(),
    });
    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.issues[0].message });
    }

    const { artistId, rootId } = parsed.data;

    const tracks = await prisma.track.findMany({
      where: {
        artistId,
        isUnavailable: false,
        ...(rootId ? { rootId } : {}),
      },
      select: { id: true, title: true, artistName: true },
    });

    if (tracks.length === 0) {
      return { success: true, totalTracks: 0, syncedCount: 0, updates: [] };
    }

    let syncedCount = 0;
    const updates: Array<{ trackId: string; playCount: number }> = [];

    for (const t of tracks) {
      try {
        const info = await getTrackInfo(t.artistName, t.title, account.username);
        if (info && info.userPlayCount > 0) {
          await prisma.userTrackStats.upsert({
            where: { userId_trackId: { userId, trackId: t.id } },
            update: {
              playCount: info.userPlayCount,
              ...(info.userLoved ? { isFavorite: true } : {}),
            },
            create: {
              userId,
              trackId: t.id,
              playCount: info.userPlayCount,
              isFavorite: info.userLoved,
            },
          });

          await prisma.externalTrackStats.upsert({
            where: { trackId_source: { trackId: t.id, source: 'lastfm' } },
            update: {
              originalPlayCount: info.userPlayCount,
              importedAt: new Date(),
            },
            create: {
              trackId: t.id,
              source: 'lastfm',
              originalFilePath: '',
              originalPlayCount: info.userPlayCount,
            },
          });

          syncedCount++;
          updates.push({ trackId: t.id, playCount: info.userPlayCount });
        }
      } catch (err) {
        console.warn(`Failed to sync Last.fm play count for track ${t.id}:`, err);
      }
      await new Promise(r => setTimeout(r, 60));
    }

    return {
      success: true,
      totalTracks: tracks.length,
      syncedCount,
      updates,
    };
  });

  // Sync play count for a single track from Last.fm
  app.post('/sync-track', async (req, reply) => {
    const userId = req.user?.id;
    if (!userId) return reply.status(401).send({ error: 'Auth required' });

    const account = await prisma.lastFmAccount.findUnique({
      where: { userId },
    });
    if (!account?.username) {
      return reply.status(400).send({ error: 'No Last.fm account linked.' });
    }

    const bodySchema = z.object({
      trackId: z.string().min(1),
    });
    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.issues[0].message });
    }

    const track = await prisma.track.findUnique({
      where: { id: parsed.data.trackId },
      select: { id: true, title: true, artistName: true },
    });
    if (!track) return reply.status(404).send({ error: 'Track not found' });

    const info = await getTrackInfo(track.artistName, track.title, account.username);
    const playCount = info?.userPlayCount || 0;

    if (playCount > 0) {
      await prisma.userTrackStats.upsert({
        where: { userId_trackId: { userId, trackId: track.id } },
        update: {
          playCount,
          ...(info?.userLoved ? { isFavorite: true } : {}),
        },
        create: {
          userId,
          trackId: track.id,
          playCount,
          isFavorite: info?.userLoved || false,
        },
      });

      await prisma.externalTrackStats.upsert({
        where: { trackId_source: { trackId: track.id, source: 'lastfm' } },
        update: {
          originalPlayCount: playCount,
          importedAt: new Date(),
        },
        create: {
          trackId: track.id,
          source: 'lastfm',
          originalFilePath: '',
          originalPlayCount: playCount,
        },
      });
    }

    return { success: true, trackId: track.id, playCount };
  });

  // Bulk sync top scrobbled tracks from Last.fm into library
  app.post('/sync-library', async (req, reply) => {
    const userId = req.user?.id;
    if (!userId) return reply.status(401).send({ error: 'Auth required' });

    const account = await prisma.lastFmAccount.findUnique({
      where: { userId },
    });
    if (!account?.username) {
      return reply.status(400).send({ error: 'No Last.fm account linked.' });
    }

    const bodySchema = z.object({
      limit: z.number().min(50).max(1000).optional().default(500),
    });
    const parsed = bodySchema.safeParse(req.body || {});
    const limit = parsed.success ? parsed.data.limit : 500;

    const topTracks = await getUserTopTracks(account.username, limit);
    if (!topTracks || topTracks.length === 0) {
      return { success: true, fetchedTracks: 0, matchedTracks: 0, updatedTracks: 0 };
    }

    let matchedTracks = 0;
    let updatedTracks = 0;

    for (const remote of topTracks) {
      if (!remote.title || !remote.artist || remote.playCount <= 0) continue;

      // Find matching track in library (case-insensitive prefix/exact match)
      const matches = await prisma.track.findMany({
        where: {
          title: { equals: remote.title },
          artistName: { equals: remote.artist },
          isUnavailable: false,
        },
        select: { id: true },
        take: 3,
      });

      if (matches.length > 0) {
        matchedTracks += matches.length;
        for (const m of matches) {
          await prisma.userTrackStats.upsert({
            where: { userId_trackId: { userId, trackId: m.id } },
            update: { playCount: remote.playCount },
            create: { userId, trackId: m.id, playCount: remote.playCount },
          });

          await prisma.externalTrackStats.upsert({
            where: { trackId_source: { trackId: m.id, source: 'lastfm' } },
            update: {
              originalPlayCount: remote.playCount,
              importedAt: new Date(),
            },
            create: {
              trackId: m.id,
              source: 'lastfm',
              originalFilePath: '',
              originalPlayCount: remote.playCount,
            },
          });
          updatedTracks++;
        }
      }
    }

    return {
      success: true,
      fetchedTracks: topTracks.length,
      matchedTracks,
      updatedTracks,
    };
  });
}
