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

    const query = req.query as { limit?: string };
    const limit = Math.min(200, Math.max(1, parseInt(query.limit || '100', 10)));

    const recentStats = await prisma.userTrackStats.findMany({
      where: {
        userId,
        lastPlayedAt: { not: null },
      },
      orderBy: { lastPlayedAt: 'desc' },
      take: limit,
      include: {
        track: true,
      },
    });

    return recentStats.map(s => {
      const sanitizedTrack = s.track
        ? {
            ...s.track,
            fileSize: Number(s.track.fileSize),
            mtimeMs: Number(s.track.mtimeMs),
          }
        : undefined;

      return {
        trackId: s.trackId,
        id: s.track.id,
        title: s.track.title,
        artistName: s.track.artistName,
        albumTitle: s.track.albumTitle,
        duration: s.track.duration,
        isLossless: s.track.isLossless,
        codec: s.track.codec,
        bitrate: s.track.bitrate,
        artworkId: s.track.artworkId,
        lastPlayedAt: s.lastPlayedAt,
        playCount: s.playCount,
        totalListeningTime: s.totalListeningTime,
        isFavorite: s.isFavorite,
        rating: s.rating,
        track: sanitizedTrack,
      };
    });
  });

  app.get('/stats', async (req, reply) => {
    const userId = req.user?.id;
    if (!userId) return reply.status(401).send({ error: 'Auth required' });

    const [totalRows, artistRows, genreRows] = await Promise.all([
      prisma.$queryRawUnsafe<any[]>(
        `SELECT
           COALESCE(SUM(CASE WHEN s.totalListeningTime > 0 THEN s.totalListeningTime ELSE s.playCount * COALESCE(t.duration, 180) END), 0) AS totalSeconds,
           COALESCE(SUM(s.playCount), 0) AS totalPlays,
           COALESCE(SUM(CASE WHEN t.isLossless = 1 THEN s.playCount ELSE 0 END), 0) AS losslessPlays,
           COALESCE(SUM(CASE WHEN s.playCount > 0 THEN 1 ELSE 0 END), 0) AS uniqueTracks,
           COUNT(DISTINCT CASE WHEN s.playCount > 0 THEN t.artistName END) AS uniqueArtists
         FROM UserTrackStats s
         LEFT JOIN Track t ON t.id = s.trackId
         WHERE s.userId = ?`,
        userId
      ),
      prisma.$queryRawUnsafe<any[]>(
        `SELECT COALESCE(t.artistName, 'Unknown Artist') AS name,
                SUM(s.playCount) AS playCount,
                SUM(CASE WHEN s.totalListeningTime > 0 THEN s.totalListeningTime ELSE s.playCount * COALESCE(t.duration, 180) END) AS seconds
         FROM UserTrackStats s
         LEFT JOIN Track t ON t.id = s.trackId
         WHERE s.userId = ?
         GROUP BY COALESCE(t.artistName, 'Unknown Artist')
         ORDER BY playCount DESC
         LIMIT 8`,
        userId
      ),
      prisma.$queryRawUnsafe<any[]>(
        `SELECT t.genre AS genre, SUM(s.playCount) AS count
         FROM UserTrackStats s
         JOIN Track t ON t.id = s.trackId
         WHERE s.userId = ? AND s.playCount > 0 AND t.genre IS NOT NULL AND t.genre <> ''
         GROUP BY t.genre`,
        userId
      ),
    ]);

    const totals = totalRows[0] || {};
    const totalListeningSeconds = Number(totals.totalSeconds) || 0;
    const totalPlays = Number(totals.totalPlays) || 0;
    const losslessPlays = Number(totals.losslessPlays) || 0;
    const uniqueTracks = Number(totals.uniqueTracks) || 0;
    const uniqueArtists = Number(totals.uniqueArtists) || 0;

    const topArtists = artistRows.map((row) => ({
      name: String(row.name),
      playCount: Number(row.playCount) || 0,
      minutes: Math.round((Number(row.seconds) || 0) / 60),
    }));

    const genrePlayMap: Record<string, number> = {};
    for (const row of genreRows) {
      const genre = String(row.genre).split(/[,;/]/)[0]?.trim();
      if (genre) genrePlayMap[genre] = (genrePlayMap[genre] || 0) + (Number(row.count) || 0);
    }

    const topGenres = Object.entries(genrePlayMap)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);

    const fourteenDaysAgo = new Date();
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 13);
    fourteenDaysAgo.setHours(0, 0, 0, 0);

    const recentSessions = await prisma.playbackSession.findMany({
      where: {
        userId,
        startedAt: { gte: fourteenDaysAgo },
      },
      select: {
        startedAt: true,
        listenedSeconds: true,
        isCompleted: true,
      },
      orderBy: { startedAt: 'asc' },
    });

    const dailyMap: Record<string, { date: string; label: string; count: number; minutes: number }> = {};
    for (let i = 0; i < 14; i++) {
      const d = new Date(fourteenDaysAgo);
      d.setDate(d.getDate() + i);
      const key = d.toISOString().split('T')[0];
      const label = d.toLocaleDateString('en-US', { weekday: 'short', month: 'numeric', day: 'numeric' });
      dailyMap[key] = { date: key, label, count: 0, minutes: 0 };
    }

    for (const session of recentSessions) {
      const key = session.startedAt.toISOString().split('T')[0];
      if (dailyMap[key]) {
        dailyMap[key].count += 1;
        dailyMap[key].minutes += Math.round(session.listenedSeconds / 60);
      }
    }

    const dailyActivity = Object.values(dailyMap);

    return {
      totalListeningHours: Number((totalListeningSeconds / 3600).toFixed(1)),
      totalPlays,
      uniqueTracks,
      uniqueArtists,
      losslessPercentage: totalPlays > 0 ? Math.round((losslessPlays / totalPlays) * 100) : 0,
      dailyActivity,
      topArtists,
      topGenres,
    };
  });
}
