import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { runLibraryScan, getScanStatus, requestScanCancellation } from '../library/scanner.js';
import { normalizePath } from '../library/paths.js';

export async function libraryRoutes(app: FastifyInstance) {
  app.get('/roots', async () => {
    const roots = await prisma.libraryRoot.findMany({
      orderBy: { name: 'asc' },
    });

    const counts = await prisma.track.groupBy({
      by: ['rootId'],
      where: { isUnavailable: false },
      _count: { id: true },
    });

    const countMap = new Map(counts.map(c => [c.rootId, c._count.id]));

    return roots.map(r => ({
      ...r,
      trackCount: countMap.get(r.id) ?? r.trackCount ?? 0,
    }));
  });

  app.post('/roots', async (req, reply) => {
    const bodySchema = z.object({
      name: z.string().min(1),
      path: z.string().min(1),
    });
    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.issues[0].message });
    }

    const norm = normalizePath(parsed.data.path);
    const existing = await prisma.libraryRoot.findUnique({ where: { path: norm } });
    if (existing) {
      return reply.status(400).send({ error: 'Library root path already exists' });
    }

    const created = await prisma.libraryRoot.create({
      data: {
        name: parsed.data.name,
        path: norm,
        isEnabled: true,
        isReadOnly: true,
      },
    });

    return created;
  });

  app.patch('/roots/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const bodySchema = z.object({
      name: z.string().optional(),
      isEnabled: z.boolean().optional(),
    });
    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.issues[0].message });
    }

    const updated = await prisma.libraryRoot.update({
      where: { id },
      data: parsed.data,
    });
    return updated;
  });

  app.post('/scan', async (req) => {
    const { rootId } = (req.body as { rootId?: string }) || {};
    const status = await runLibraryScan(rootId);
    return { success: true, status };
  });

  app.post('/scan/cancel', async () => {
    const cancelled = requestScanCancellation();
    return { success: cancelled };
  });

  app.get('/status', async () => {
    return getScanStatus();
  });

  app.get('/stats', async () => {
    const totalTracks = await prisma.track.count({ where: { isUnavailable: false } });
    const totalArtists = await prisma.artist.count();
    const totalAlbums = await prisma.album.count();
    const totalPlaylists = await prisma.playlist.count();

    const aggregate = await prisma.track.aggregate({
      where: { isUnavailable: false },
      _sum: {
        duration: true,
        fileSize: true,
      },
    });

    return {
      totalTracks,
      totalArtists,
      totalAlbums,
      totalPlaylists,
      totalDurationSeconds: aggregate._sum.duration || 0,
      totalFileSizeBytes: aggregate._sum.fileSize ? aggregate._sum.fileSize.toString() : '0',
    };
  });
}
