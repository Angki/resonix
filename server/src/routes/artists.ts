import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import fs from 'fs';
import path from 'path';
import { prisma } from '../db.js';
import { config } from '../config.js';
import { artistArtService } from '../artists/artistArtService.js';
import { similarArtistsService } from '../artists/similarArtistsService.js';

function generateSvgAvatar(name: string): string {
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map(w => w[0]?.toUpperCase() || '')
    .join('') || name.slice(0, 2).toUpperCase() || '??';

  // Deterministic subtle dark gradient based on artist name hash
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash << 5) - hash + name.charCodeAt(i);
    hash |= 0;
  }
  const hues = [0, 340, 270, 210, 180, 40];
  const hue = hues[Math.abs(hash) % hues.length];

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="200" height="200">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="hsl(${hue}, 40%, 15%)" />
      <stop offset="100%" stop-color="hsl(${hue}, 20%, 7%)" />
    </linearGradient>
    <radialGradient id="glow" cx="50%" cy="40%" r="50%">
      <stop offset="0%" stop-color="hsl(${hue}, 60%, 40%)" stop-opacity="0.25" />
      <stop offset="100%" stop-color="transparent" stop-opacity="0" />
    </radialGradient>
  </defs>
  <rect width="200" height="200" rx="24" fill="url(#bg)" />
  <rect width="200" height="200" rx="24" fill="url(#glow)" />
  <circle cx="100" cy="100" r="90" fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="2" />
  <text x="100" y="112" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="48" font-weight="700" fill="#e4e4e7" text-anchor="middle" dominant-baseline="middle" letter-spacing="2">${initials}</text>
</svg>`;
}

export async function artistsRoutes(app: FastifyInstance) {
  // 1. List all artists with counts and art presence
  app.get('/', async (req: FastifyRequest<{
    Querystring: {
      search?: string;
      sortBy?: 'name' | 'albumCount' | 'trackCount';
      order?: 'asc' | 'desc';
      limit?: string;
      offset?: string;
      rootId?: string;
    };
  }>) => {
    const { search, sortBy = 'name', order = 'asc', limit, offset, rootId } = req.query;

    const where: any = {};
    if (search && search.trim()) {
      where.name = { contains: search.trim() };
    }
    if (rootId) {
      where.tracks = { some: { rootId, isUnavailable: false } };
    }

    const artists = await prisma.artist.findMany({
      where,
      select: {
        id: true,
        name: true,
        photoPath: true,
        logoPath: true,
        _count: {
          select: {
            tracks: { where: { isUnavailable: false, ...(rootId ? { rootId } : {}) } },
            albums: rootId ? { where: { tracks: { some: { rootId, isUnavailable: false } } } } : true,
          },
        },
      },
      orderBy: sortBy === 'name' ? { name: order } : undefined,
      take: limit ? Math.min(Number(limit) || 100, 1000) : undefined,
      skip: offset ? Number(offset) || 0 : undefined,
    });

    const diskFiles = new Set(
      fs.existsSync(config.artistArtDir) ? fs.readdirSync(config.artistArtDir) : []
    );

    // Aggregate play counts per artist for this collection / library
    const rootFilter = rootId ? `AND t.rootId = '${rootId.replace(/'/g, "''")}'` : '';
    let playMap = new Map<string, number>();
    try {
      const playStats = await prisma.$queryRawUnsafe<Array<{ artistId: string; totalPlays: number }>>(`
        SELECT t.artistId,
               CAST(COALESCE(SUM(t.importedPlayCount + COALESCE(s.userPlays, 0)), 0) AS INTEGER) as totalPlays
        FROM Track t
        LEFT JOIN (
          SELECT trackId, SUM(playCount) as userPlays FROM UserTrackStats GROUP BY trackId
        ) s ON s.trackId = t.id
        WHERE t.isUnavailable = 0 ${rootFilter}
        GROUP BY t.artistId
      `);
      for (const p of playStats) {
        if (p.artistId) {
          playMap.set(p.artistId, Number(p.totalPlays) || 0);
        }
      }
    } catch (err) {
      console.warn('Failed to aggregate artist play counts:', err);
    }

    const mapped = artists.map(a => ({
      id: a.id,
      name: a.name,
      trackCount: a._count.tracks,
      albumCount: a._count.albums,
      totalPlays: playMap.get(a.id) || 0,
      hasPhoto: Boolean(a.photoPath && diskFiles.has(path.basename(a.photoPath))),
      hasLogo: Boolean(a.logoPath && diskFiles.has(path.basename(a.logoPath))),
    }));

    // In-memory sort if sorting by aggregate counts
    if (sortBy === 'albumCount') {
      mapped.sort((x, y) => order === 'asc' ? x.albumCount - y.albumCount : y.albumCount - x.albumCount);
    } else if (sortBy === 'trackCount') {
      mapped.sort((x, y) => order === 'asc' ? x.trackCount - y.trackCount : y.trackCount - x.trackCount);
    } else if ((sortBy as string) === 'totalPlays') {
      mapped.sort((x, y) => order === 'asc' ? x.totalPlays - y.totalPlays : y.totalPlays - x.totalPlays);
    }

    return mapped;
  });

  // 2. Batch fetch status
  app.get('/batch-status', async () => {
    return await artistArtService.getBatchStatus();
  });

  // 3. Batch fetch trigger / pause
  app.post('/batch-fetch', async (req: FastifyRequest<{
    Body: { action?: 'start' | 'pause'; force?: boolean };
  }>) => {
    const { action = 'start', force = false } = (req.body || {}) as any;
    if (action === 'pause') {
      artistArtService.pauseBatchFetch();
      return { ok: true, status: 'paused' };
    } else {
      artistArtService.startBatchFetch(force);
      return { ok: true, status: 'started' };
    }
  });

  // 4. Detailed Artist Info with grouped Discography
  app.get('/:id', async (req: FastifyRequest<{
    Params: { id: string };
    Querystring: { rootId?: string };
  }>, reply: FastifyReply) => {
    const { id } = req.params;
    const { rootId } = req.query;

    const artist = await prisma.artist.findUnique({
      where: { id },
      include: {
        albums: {
          where: rootId ? { tracks: { some: { rootId, isUnavailable: false } } } : undefined,
          include: {
            artwork: true,
            tracks: {
              where: { isUnavailable: false, ...(rootId ? { rootId } : {}) },
              include: {
                userStats: true,
              },
              orderBy: [
                { discNumber: 'asc' },
                { trackNumber: 'asc' },
                { filename: 'asc' },
              ],
            },
          },
          orderBy: { year: 'desc' },
        },
        _count: {
          select: {
            tracks: { where: { isUnavailable: false, ...(rootId ? { rootId } : {}) } },
            albums: rootId ? { where: { tracks: { some: { rootId, isUnavailable: false } } } } : true,
          },
        },
      },
    });

    if (!artist) {
      return reply.status(404).send({ error: 'Artist not found' });
    }

    // Top tracks by play counts
    const topTracks = await prisma.track.findMany({
      where: { artistId: id, isUnavailable: false, ...(rootId ? { rootId } : {}) },
      take: 10,
      orderBy: { importedPlayCount: 'desc' },
    });

    const getTrackLocalPlays = (t: any): number => {
      if (!t.userStats || !Array.isArray(t.userStats)) return 0;
      return t.userStats.reduce((s: number, u: any) => s + (u.playCount || 0), 0);
    };

    const totalArtistPlays = artist.albums.reduce(
      (sum, al) =>
        sum +
        al.tracks.reduce(
          (tSum, t) => tSum + getTrackLocalPlays(t) + (t.importedPlayCount || 0),
          0
        ),
      0
    );

    return {
      id: artist.id,
      name: artist.name,
      bio: artist.bio,
      discogsId: artist.discogsId,
      metallumId: artist.metallumId,
      trackCount: artist._count.tracks,
      albumCount: artist._count.albums,
      hasPhoto: Boolean(artist.photoPath && fs.existsSync(artist.photoPath)),
      hasLogo: Boolean(artist.logoPath && fs.existsSync(artist.logoPath)),
      totalPlays: totalArtistPlays,
      albums: artist.albums.map(al => {
        const totalAlbumPlays = al.tracks.reduce(
          (sum, t) => sum + getTrackLocalPlays(t) + (t.importedPlayCount || 0),
          0
        );
        return {
          id: al.id,
          title: al.title,
          year: al.year,
          artworkId: al.artworkId,
          trackCount: al.tracks.length,
          totalPlays: totalAlbumPlays,
          isLossless: al.tracks.some(t => t.isLossless),
          tracks: al.tracks.map(t => {
            const localPlayCount = getTrackLocalPlays(t);
            const importedPlayCount = t.importedPlayCount || 0;
            return {
              id: t.id,
              title: t.title,
              trackNumber: t.trackNumber,
              discNumber: t.discNumber,
              duration: t.duration,
              bitrate: t.bitrate,
              isLossless: t.isLossless,
              year: t.year,
              localPlayCount,
              importedPlayCount,
              combinedPlayCount: localPlayCount + importedPlayCount,
            };
          }),
        };
      }),
      topTracks: topTracks.map(t => ({
        id: t.id,
        title: t.title,
        albumTitle: t.albumTitle,
        duration: t.duration,
        importedPlayCount: t.importedPlayCount,
      })),
    };
  });

  // 5. Stream Artist Photo
  app.get('/:id/photo', async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const { id } = req.params;

    const artist = await prisma.artist.findUnique({
      where: { id },
      select: { name: true, photoPath: true },
    });

    if (!artist) {
      return reply
        .header('Content-Type', 'image/svg+xml')
        .header('Cache-Control', 'public, max-age=86400')
        .send(generateSvgAvatar('?'));
    }

    if (artist.photoPath && fs.existsSync(artist.photoPath)) {
      const ext = path.extname(artist.photoPath).toLowerCase();
      const contentType = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
      const stream = fs.createReadStream(artist.photoPath);
      return reply
        .header('Content-Type', contentType)
        .header('Cache-Control', 'public, max-age=86400')
        .send(stream);
    }

    // Fallback dynamic SVG avatar
    return reply
      .header('Content-Type', 'image/svg+xml')
      .header('Cache-Control', 'public, max-age=3600')
      .send(generateSvgAvatar(artist.name));
  });

  // 6. Stream Band Logo
  app.get('/:id/logo', async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const { id } = req.params;

    const artist = await prisma.artist.findUnique({
      where: { id },
      select: { logoPath: true },
    });

    if (artist?.logoPath && fs.existsSync(artist.logoPath)) {
      const ext = path.extname(artist.logoPath).toLowerCase();
      const contentType = ext === '.png' ? 'image/png' : 'image/jpeg';
      const stream = fs.createReadStream(artist.logoPath);
      return reply
        .header('Content-Type', contentType)
        .header('Cache-Control', 'public, max-age=86400')
        .send(stream);
    }

    return reply.status(404).send({ error: 'Logo not found' });
  });

  // 7. On-demand Trigger Fetch Art for an Artist
  app.post('/:id/fetch-art', async (req: FastifyRequest<{
    Params: { id: string };
    Body?: { force?: boolean };
  }>, reply: FastifyReply) => {
    const { id } = req.params;
    const force = Boolean(req.body?.force);

    try {
      const res = await artistArtService.fetchArtistArt(id, force);
      return { ok: true, data: res };
    } catch (err: any) {
      return reply.status(500).send({ error: err?.message || 'Failed to fetch artist art' });
    }
  });

  // 8. Get Similar Artists
  app.get('/:id/similar', async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const { id } = req.params;
    try {
      const similar = await similarArtistsService.getSimilarArtists(id, false);
      return { artistId: id, count: similar.length, similar };
    } catch (err: any) {
      return reply.status(500).send({ error: err?.message || 'Failed to get similar artists' });
    }
  });

  // 9. Re-fetch Similar Artists
  app.post('/:id/similar/refetch', async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const { id } = req.params;
    try {
      const similar = await similarArtistsService.getSimilarArtists(id, true);
      return { artistId: id, count: similar.length, similar };
    } catch (err: any) {
      return reply.status(500).send({ error: err?.message || 'Failed to refetch similar artists' });
    }
  });
}
