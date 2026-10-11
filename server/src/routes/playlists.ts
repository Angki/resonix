import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';

export async function playlistsRoutes(app: FastifyInstance) {
  app.get('/', async (req, reply) => {
    const userId = req.user?.id;
    if (!userId) return reply.status(401).send({ error: 'Auth required' });

    const playlists = await prisma.playlist.findMany({
      where: { userId },
      orderBy: { name: 'asc' },
      include: {
        _count: { select: { tracks: true } },
      },
    });

    return playlists.map(p => ({
      id: p.id,
      name: p.name,
      description: p.description,
      isSmart: p.isSmart,
      trackCount: p._count.tracks,
      updatedAt: p.updatedAt,
    }));
  });

  app.post('/', async (req, reply) => {
    const userId = req.user?.id;
    if (!userId) return reply.status(401).send({ error: 'Auth required' });

    const bodySchema = z.object({
      name: z.string().min(1).max(100),
      description: z.string().optional(),
      isSmart: z.boolean().optional(),
      smartRules: z.string().optional(),
    });

    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.issues[0].message });

    const playlist = await prisma.playlist.create({
      data: {
        userId,
        name: parsed.data.name,
        description: parsed.data.description,
        isSmart: parsed.data.isSmart ?? false,
        smartRules: parsed.data.smartRules,
      },
    });

    return playlist;
  });

  app.get('/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const userId = req.user?.id;

    const playlist = await prisma.playlist.findUnique({
      where: { id },
      include: {
        tracks: {
          orderBy: { sortOrder: 'asc' },
          include: {
            track: {
              include: {
                userStats: userId ? { where: { userId } } : false,
              },
            },
          },
        },
      },
    });

    if (!playlist) return reply.status(404).send({ error: 'Playlist not found' });

    const tracks = playlist.tracks.map(pt => {
      const t = pt.track;
      const userStat = t.userStats?.[0];
      return {
        id: t.id,
        sortOrder: pt.sortOrder,
        title: t.title,
        artistName: t.artistName,
        albumTitle: t.albumTitle,
        duration: t.duration,
        year: t.year,
        genre: t.genre,
        codec: t.codec,
        bitrate: t.bitrate,
        isFavorite: userStat?.isFavorite ?? false,
        rating: userStat?.rating ?? null,
        localPlayCount: userStat?.playCount || 0,
        combinedPlayCount: (userStat?.playCount || 0) + (t.importedPlayCount || 0),
      };
    });

    return {
      id: playlist.id,
      name: playlist.name,
      description: playlist.description,
      isSmart: playlist.isSmart,
      tracks,
    };
  });

  app.post('/:id/tracks', async (req, reply) => {
    const { id } = req.params as { id: string };
    const { trackIds } = req.body as { trackIds: string[] };

    if (!Array.isArray(trackIds) || trackIds.length === 0) {
      return reply.status(400).send({ error: 'trackIds array required' });
    }

    const highest = await prisma.playlistTrack.findFirst({
      where: { playlistId: id },
      orderBy: { sortOrder: 'desc' },
      select: { sortOrder: true },
    });

    let currentOrder = (highest?.sortOrder ?? -1) + 1;

    for (const trackId of trackIds) {
      await prisma.playlistTrack.create({
        data: {
          playlistId: id,
          trackId,
          sortOrder: currentOrder++,
        },
      });
    }

    return { success: true, addedCount: trackIds.length };
  });

  app.delete('/:id/tracks/:trackId', async (req, reply) => {
    const { id, trackId } = req.params as { id: string; trackId: string };

    await prisma.playlistTrack.deleteMany({
      where: { playlistId: id, trackId },
    });

    return { success: true };
  });

  app.get('/:id/export.m3u8', async (req, reply) => {
    const { id } = req.params as { id: string };

    const playlist = await prisma.playlist.findUnique({
      where: { id },
      include: {
        tracks: {
          orderBy: { sortOrder: 'asc' },
          include: { track: true },
        },
      },
    });

    if (!playlist) return reply.status(404).send({ error: 'Playlist not found' });

    let m3u = '#EXTM3U\n';
    for (const pt of playlist.tracks) {
      const t = pt.track;
      m3u += `#EXTINF:${Math.round(t.duration)},${t.artistName} - ${t.title}\n`;
      m3u += `${t.fullPath}\n`;
    }

    reply.header('Content-Type', 'application/x-mpegurl; charset=utf-8');
    reply.header('Content-Disposition', `attachment; filename="${encodeURIComponent(playlist.name)}.m3u8"`);
    return reply.send(m3u);
  });
}
