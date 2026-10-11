import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { encryptSecret } from '../crypto.js';
import {
  requestLastFmToken,
  exchangeTokenForSession,
  processScrobbleQueue,
  getLastFmCredentials,
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
}
