import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { startPlaybackSession, reportPlaybackProgress, toggleFavorite, setTrackRating } from '../playback/tracker.js';
import { prisma } from '../db.js';

export async function playbackRoutes(app: FastifyInstance) {
  app.post('/start', async (req, reply) => {
    const userId = req.user?.id;
    if (!userId) return reply.status(401).send({ error: 'Auth required' });

    const bodySchema = z.object({
      trackId: z.string(),
      clientInfo: z.string().optional(),
    });

    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.issues[0].message });

    const session = await startPlaybackSession(userId, parsed.data.trackId, parsed.data.clientInfo);
    return {
      sessionId: session.id,
      startedAt: session.startedAt,
    };
  });

  app.post('/progress', async (req, reply) => {
    const userId = req.user?.id;
    if (!userId) return reply.status(401).send({ error: 'Auth required' });

    const bodySchema = z.object({
      trackId: z.string(),
      sessionId: z.string(),
      listenedSeconds: z.number().min(0),
      eventId: z.string().min(1),
    });

    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.issues[0].message });

    const result = await reportPlaybackProgress({
      userId,
      trackId: parsed.data.trackId,
      sessionId: parsed.data.sessionId,
      listenedSeconds: parsed.data.listenedSeconds,
      eventId: parsed.data.eventId,
    });

    return result;
  });

  app.post('/favorite', async (req, reply) => {
    const userId = req.user?.id;
    if (!userId) return reply.status(401).send({ error: 'Auth required' });

    const { trackId } = req.body as { trackId: string };
    if (!trackId) return reply.status(400).send({ error: 'trackId is required' });

    const isFavorite = await toggleFavorite(userId, trackId);
    return { trackId, isFavorite };
  });

  app.post('/rate', async (req, reply) => {
    const userId = req.user?.id;
    if (!userId) return reply.status(401).send({ error: 'Auth required' });

    const { trackId, rating } = req.body as { trackId: string; rating: number | null };
    if (!trackId) return reply.status(400).send({ error: 'trackId is required' });

    const updated = await setTrackRating(userId, trackId, rating);
    return { trackId, rating: updated.rating };
  });

  app.get('/history', async (req, reply) => {
    const userId = req.user?.id;
    if (!userId) return reply.status(401).send({ error: 'Auth required' });

    const recentStats = await prisma.userTrackStats.findMany({
      where: {
        userId,
        lastPlayedAt: { not: null },
      },
      orderBy: { lastPlayedAt: 'desc' },
      take: 50,
      include: {
        track: true,
      },
    });

    return recentStats.map(s => ({
      trackId: s.trackId,
      title: s.track.title,
      artistName: s.track.artistName,
      albumTitle: s.track.albumTitle,
      duration: s.track.duration,
      lastPlayedAt: s.lastPlayedAt,
      playCount: s.playCount,
    }));
  });
}
