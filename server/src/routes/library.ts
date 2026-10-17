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
    if (req.user?.role !== 'admin') {
      return reply.status(403).send({ error: 'Admin access required to add library roots' });
    }

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
    if (req.user?.role !== 'admin') {
      return reply.status(403).send({ error: 'Admin access required to modify library roots' });
    }

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

  app.post('/scan', async (req, reply) => {
    if (req.user?.role !== 'admin') {
      return reply.status(403).send({ error: 'Admin access required to trigger library scans' });
    }

    const { rootId } = (req.body as { rootId?: string }) || {};
    const status = await runLibraryScan(rootId);
    return { success: true, status };
  });

  app.post('/scan/cancel', async (req, reply) => {
    if (req.user?.role !== 'admin') {
      return reply.status(403).send({ error: 'Admin access required to cancel library scans' });
    }

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

  app.get('/audit', async () => {
    const [totalTracks, totalAlbums, totalArtists, totalRoots] = await Promise.all([
      prisma.track.count({ where: { isUnavailable: false } }),
      prisma.album.count(),
      prisma.artist.count(),
      prisma.libraryRoot.count({ where: { isEnabled: true } }),
    ]);

    const qualityStats = await prisma.track.groupBy({
      by: ['isLossless', 'codec'],
      where: { isUnavailable: false },
      _count: { id: true },
    });

    const hiResCount = await prisma.track.count({
      where: {
        isUnavailable: false,
        isLossless: true,
        OR: [
          { bitDepth: { gte: 24 } },
          { sampleRate: { gt: 48000 } },
        ],
      },
    });

    const cdLosslessCount = await prisma.track.count({
      where: {
        isUnavailable: false,
        isLossless: true,
        AND: [
          { OR: [{ bitDepth: null }, { bitDepth: { lt: 24 } }] },
          { OR: [{ sampleRate: null }, { sampleRate: { lte: 48000 } }] },
        ],
      },
    });

    const highLossyCount = await prisma.track.count({
      where: {
        isUnavailable: false,
        isLossless: false,
        bitrate: { gte: 320 },
      },
    });

    const lowLossyCount = await prisma.track.count({
      where: {
        isUnavailable: false,
        isLossless: false,
        bitrate: { lt: 320 },
      },
    });

    const [missingGenre, missingYear, missingArtwork, missingTrackNumber, unavailableTracks] = await Promise.all([
      prisma.track.count({ where: { isUnavailable: false, genre: null } }),
      prisma.track.count({ where: { isUnavailable: false, year: null } }),
      prisma.album.count({ where: { artworkId: null } }),
      prisma.track.count({ where: { isUnavailable: false, trackNumber: null } }),
      prisma.track.count({ where: { isUnavailable: true } }),
    ]);

    const codecMap: Record<string, number> = {};
    for (const s of qualityStats) {
      const c = (s.codec || 'UNKNOWN').toUpperCase();
      codecMap[c] = (codecMap[c] || 0) + s._count.id;
    }

    const healthPenalty = (missingGenre * 0.5 + missingYear * 0.5 + missingArtwork * 2 + missingTrackNumber * 0.5 + unavailableTracks * 3);
    const healthDenominator = Math.max(1, totalTracks + totalAlbums);
    const healthScore = Math.max(0, Math.min(100, Math.round(100 - (healthPenalty / healthDenominator) * 100)));

    return {
      totals: {
        tracks: totalTracks,
        albums: totalAlbums,
        artists: totalArtists,
        roots: totalRoots,
      },
      quality: {
        hiRes: hiResCount,
        cdLossless: cdLosslessCount,
        highLossy: highLossyCount,
        lowLossy: lowLossyCount,
        losslessPercent: totalTracks > 0 ? Math.round(((hiResCount + cdLosslessCount) / totalTracks) * 100) : 0,
        codecs: codecMap,
      },
      metadataHealth: {
        missingGenre,
        missingYear,
        missingArtworkAlbums: missingArtwork,
        missingTrackNumber,
        unavailableTracks,
        healthScore,
      },
    };
  });
}
