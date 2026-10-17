import { FastifyInstance, FastifyRequest } from 'fastify';
import fs from 'fs';
import path from 'path';
import { prisma } from '../db.js';

export type SearchField = 'all' | 'album' | 'artist' | 'title';

/** Builds SQLite FTS5 MATCH query string from search input */
export function buildFtsQuery(search: string | undefined, field: SearchField): string {
  if (!search) return '';
  const tokens = search
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .trim()
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 8);

  if (tokens.length === 0) return '';

  if (field === 'title') {
    return tokens.map((t) => `title:"${t}"*`).join(' AND ');
  } else if (field === 'artist') {
    return tokens.map((t) => `artistName:"${t}"*`).join(' AND ');
  } else if (field === 'album') {
    return tokens.map((t) => `albumTitle:"${t}"*`).join(' AND ');
  }
  return tokens.map((t) => `"${t}"*`).join(' AND ');
}

function tokenize(search?: string): string[] {
  if (!search) return [];
  return search
    .trim()
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 8);
}

export function normalizeField(field?: string): SearchField {
  if (!field) return 'all';
  const f = field.toLowerCase().trim();
  if (f === 'album' || f === 'artist' || f === 'title') return f;
  return 'all';
}

/** Track-level conditions: every token must match at least one field in scope. */
export function buildTrackSearch(search: string | undefined, field: SearchField): any[] {
  return tokenize(search).map((tok) => {
    const c = { contains: tok };
    switch (field) {
      case 'album':
        return { OR: [{ albumTitle: c }, { folderAlbum: c }] };
      case 'artist':
        return { OR: [{ artistName: c }, { albumArtist: c }, { folderArtist: c }] };
      case 'title':
        return { OR: [{ title: c }, { filename: c }] };
      default:
        return {
          OR: [
            { title: c },
            { artistName: c },
            { albumArtist: c },
            { albumTitle: c },
            { folderAlbum: c },
            { folderArtist: c },
            { filename: c },
          ],
        };
    }
  });
}

/** Album-level conditions: matches album title/artist, or any contained track title. */
export function buildAlbumSearch(search: string | undefined, field: SearchField): any[] {
  return tokenize(search).map((tok) => {
    const c = { contains: tok };
    const byTitle = {
      OR: [
        { title: c },
        { tracks: { some: { OR: [{ albumTitle: c }, { folderAlbum: c }] } } },
      ],
    };
    const byArtist = {
      OR: [
        { artist: { name: c } },
        { tracks: { some: { OR: [{ albumArtist: c }, { artistName: c }, { folderArtist: c }] } } },
      ],
    };
    const bySong = { tracks: { some: { OR: [{ title: c }, { filename: c }], isUnavailable: false } } };
    switch (field) {
      case 'album':
        return byTitle;
      case 'artist':
        return byArtist;
      case 'title':
        return bySong;
      default:
        return { OR: [byTitle, byArtist, bySong] };
    }
  });
}

export async function tracksRoutes(app: FastifyInstance) {
  app.get('/', async (req) => {
    const query = req.query as {
      search?: string;
      searchField?: string;
      rootId?: string;
      artistId?: string;
      artistName?: string;
      albumId?: string;
      albumTitle?: string;
      genre?: string;
      year?: string;
      favoritesOnly?: string;
      playlistId?: string;
      sortBy?: string;
      sortOrder?: 'asc' | 'desc';
      page?: string;
      limit?: string;
      shuffle?: string;
    };

    const userId = req.user?.id;
    const page = Math.max(1, parseInt(query.page || '1', 10));
    const limit = Math.min(10000, Math.max(1, parseInt(query.limit || '1000', 10)));
    const skip = (page - 1) * limit;

    const sortField = query.sortBy;
    const sortDir = query.sortOrder === 'desc' ? 'desc' : 'asc';

    if (sortField === 'random' || query.shuffle === 'true') {
      // Use raw query for true high-speed SQLite RANDOM() selection
      const whereConditions: string[] = ['t.isUnavailable = 0'];
      const params: any[] = [];

      if (userId) {
        params.push(userId);
      }

      if (query.rootId) {
        whereConditions.push('t.rootId = ?');
        params.push(query.rootId);
      }
      if (query.artistId) {
        whereConditions.push('t.artistId = ?');
        params.push(query.artistId);
      }
      if (query.artistName) {
        whereConditions.push('t.artistName LIKE ?');
        params.push(`%${query.artistName}%`);
      }
      if (query.albumId) {
        whereConditions.push('t.albumId = ?');
        params.push(query.albumId);
      }
      if (query.albumTitle) {
        whereConditions.push('t.albumTitle LIKE ?');
        params.push(`%${query.albumTitle}%`);
      }
      if (query.genre) {
        whereConditions.push('t.genre LIKE ?');
        params.push(`%${query.genre}%`);
      }
      if (query.year) {
        whereConditions.push('t.year = ?');
        params.push(parseInt(query.year, 10));
      }

      // Filter by search tokens
      const sTokens = tokenize(query.search);
      const sField = normalizeField(query.searchField);
      for (const tok of sTokens) {
        const p = `%${tok}%`;
        if (sField === 'album') {
          whereConditions.push('(t.albumTitle LIKE ? OR t.folderAlbum LIKE ?)');
          params.push(p, p);
        } else if (sField === 'artist') {
          whereConditions.push('(t.artistName LIKE ? OR t.albumArtist LIKE ? OR t.folderArtist LIKE ?)');
          params.push(p, p, p);
        } else if (sField === 'title') {
          whereConditions.push('(t.title LIKE ? OR t.filename LIKE ?)');
          params.push(p, p);
        } else {
          whereConditions.push(
            '(t.title LIKE ? OR t.artistName LIKE ? OR t.albumArtist LIKE ? OR t.albumTitle LIKE ? OR t.folderAlbum LIKE ? OR t.folderArtist LIKE ? OR t.filename LIKE ?)'
          );
          params.push(p, p, p, p, p, p, p);
        }
      }

      if (query.favoritesOnly === 'true' && userId) {
        whereConditions.push('EXISTS (SELECT 1 FROM UserTrackStats u WHERE u.trackId = t.id AND u.userId = ? AND u.isFavorite = 1)');
        params.push(userId);
      }

      if (query.playlistId) {
        whereConditions.push('EXISTS (SELECT 1 FROM PlaylistTrack pt WHERE pt.trackId = t.id AND pt.playlistId = ?)');
        params.push(query.playlistId);
      }

      const whereSql = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';
      const limitVal = Math.min(limit, 500);

      const userJoinSql = userId
        ? 'LEFT JOIN UserTrackStats us ON (t.id = us.trackId AND us.userId = ?)'
        : '';
      const selectUserFields = userId
        ? ', us.isFavorite as userFavorite, us.playCount as userPlayCount, us.rating as userRating, us.lastPlayedAt as userLastPlayed'
        : '';

      const randomRows = await prisma.$queryRawUnsafe<any[]>(
        `SELECT t.*, r.name as collectionName ${selectUserFields}
         FROM Track t 
         LEFT JOIN LibraryRoot r ON t.rootId = r.id 
         ${userJoinSql}
         ${whereSql} 
         ORDER BY RANDOM() 
         LIMIT ${limitVal}`,
        ...params
      );

      const formatted = randomRows.map(t => {
        const localPlayCount = t.userPlayCount ? Number(t.userPlayCount) : 0;
        const importedPlayCount = t.importedPlayCount ? Number(t.importedPlayCount) : 0;
        return {
          id: t.id,
          rootId: t.rootId,
          collectionName: t.collectionName || 'Library',
          relativePath: t.relativePath,
          filename: t.filename,
          extension: t.extension,
          fileSize: Number(t.fileSize),
          title: t.title,
          trackNumber: t.trackNumber,
          discNumber: t.discNumber,
          duration: t.duration,
          year: t.year,
          genre: t.genre,
          codec: t.codec,
          bitrate: t.bitrate,
          sampleRate: t.sampleRate,
          bitDepth: t.bitDepth,
          channels: t.channels,
          isLossless: Boolean(t.isLossless),
          artistId: t.artistId,
          artistName: t.artistName,
          albumId: t.albumId,
          albumTitle: t.albumTitle,
          albumArtist: t.albumArtist,
          folderArtist: t.folderArtist,
          folderAlbum: t.folderAlbum,
          folderPath: t.folderPath,
          artworkId: t.artworkId,
          isFavorite: Boolean(t.userFavorite),
          rating: t.userRating !== undefined && t.userRating !== null ? Number(t.userRating) : null,
          localPlayCount,
          importedPlayCount,
          combinedPlayCount: localPlayCount + importedPlayCount,
          lastPlayed: t.userLastPlayed || t.importedLastPlayed || null,
          dateAdded: t.createdAt ? new Date(t.createdAt).toISOString() : new Date().toISOString(),
        };
      });

      return {
        total: formatted.length,
        page: 1,
        limit: limitVal,
        tracks: formatted,
      };
    }

    const where: any = {
      isUnavailable: false,
    };

    if (query.rootId) {
      where.rootId = query.rootId;
    }
    if (query.artistId) {
      where.artistId = query.artistId;
    }
    if (query.artistName) {
      where.artistName = { contains: query.artistName };
    }
    if (query.albumId) {
      where.albumId = query.albumId;
    }
    if (query.albumTitle) {
      where.albumTitle = { contains: query.albumTitle };
    }
    if (query.genre) {
      where.genre = { contains: query.genre };
    }
    if (query.year) {
      where.year = parseInt(query.year, 10);
    }

    const sField = normalizeField(query.searchField);
    if (query.search && query.search.trim()) {
      let ftsSuccess = false;
      const ftsQuery = buildFtsQuery(query.search, sField);
      if (ftsQuery) {
        try {
          const ftsRows = (await prisma.$queryRawUnsafe(
            `SELECT trackId FROM TrackFts WHERE TrackFts MATCH ? ORDER BY rank LIMIT 1000;`,
            ftsQuery
          )) as Array<{ trackId: string }>;
          const matchedIds = ftsRows.map((r) => r.trackId);
          where.id = { in: matchedIds };
          ftsSuccess = true;
        } catch {
          ftsSuccess = false;
        }
      }
      if (!ftsSuccess) {
        const trackSearch = buildTrackSearch(query.search, sField);
        if (trackSearch.length > 0) {
          where.AND = trackSearch;
        }
      }
    }

    if (query.favoritesOnly === 'true' && userId) {
      where.userStats = {
        some: {
          userId,
          isFavorite: true,
        },
      };
    }

    if (query.playlistId) {
      where.playlistTracks = {
        some: {
          playlistId: query.playlistId,
        },
      };
    }

    let orderBy: any = {};
    if (query.albumId && !sortField) {
      // Natural album track order
      orderBy = [{ discNumber: 'asc' }, { trackNumber: 'asc' }, { filename: 'asc' }];
    } else if (sortField === 'title') {
      orderBy = { title: sortDir };
    } else if (sortField === 'albumTitle') {
      orderBy = [{ albumTitle: sortDir }, { discNumber: 'asc' }, { trackNumber: 'asc' }];
    } else if (sortField === 'year') {
      orderBy = [{ year: sortDir }, { title: 'asc' }];
    } else if (sortField === 'duration') {
      orderBy = { duration: sortDir };
    } else if (sortField === 'dateAdded') {
      orderBy = { createdAt: sortDir };
    } else {
      orderBy = [{ artistName: sortDir }, { albumTitle: 'asc' }, { discNumber: 'asc' }, { trackNumber: 'asc' }];
    }

    const [total, tracks] = await Promise.all([
      prisma.track.count({ where }),
      prisma.track.findMany({
        where,
        orderBy,
        skip,
        take: limit,
        include: {
          userStats: userId ? { where: { userId } } : false,
          root: { select: { id: true, name: true } },
        },
      }),
    ]);

    // Format BigInt fields to numbers/strings so JSON.stringify succeeds
    const formatted = tracks.map(t => {
      const userStat = t.userStats?.[0];
      const localPlayCount = userStat?.playCount || 0;
      const combinedPlayCount = localPlayCount + (t.importedPlayCount || 0);

      return {
        id: t.id,
        rootId: t.rootId,
        collectionName: t.root?.name || 'Library',
        relativePath: t.relativePath,
        filename: t.filename,
        extension: t.extension,
        fileSize: Number(t.fileSize),
        title: t.title,
        trackNumber: t.trackNumber,
        discNumber: t.discNumber,
        duration: t.duration,
        year: t.year,
        genre: t.genre,
        codec: t.codec,
        bitrate: t.bitrate,
        sampleRate: t.sampleRate,
        bitDepth: t.bitDepth,
        channels: t.channels,
        isLossless: t.isLossless,
        artistId: t.artistId,
        artistName: t.artistName,
        albumId: t.albumId,
        albumTitle: t.albumTitle,
        albumArtist: t.albumArtist,
        folderArtist: t.folderArtist,
        folderAlbum: t.folderAlbum,
        folderPath: t.folderPath,
        artworkId: t.artworkId,
        isFavorite: userStat?.isFavorite ?? false,
        rating: userStat?.rating ?? null,
        localPlayCount,
        importedPlayCount: t.importedPlayCount,
        combinedPlayCount,
        lastPlayed: userStat?.lastPlayedAt ?? t.importedLastPlayed ?? null,
        dateAdded: t.createdAt,
      };
    });

    return {
      total,
      page,
      limit,
      tracks: formatted,
    };
  });

  app.get('/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const userId = req.user?.id;

    const track = await prisma.track.findUnique({
      where: { id },
      include: {
        userStats: userId ? { where: { userId } } : false,
        root: { select: { id: true, name: true } },
      },
    });

    if (!track) return reply.status(404).send({ error: 'Track not found' });

    const userStat = track.userStats?.[0];
    return {
      ...track,
      fileSize: Number(track.fileSize),
      mtimeMs: Number(track.mtimeMs),
      isFavorite: userStat?.isFavorite ?? false,
      rating: userStat?.rating ?? null,
      localPlayCount: userStat?.playCount || 0,
      combinedPlayCount: (userStat?.playCount || 0) + (track.importedPlayCount || 0),
    };
  });

  app.get('/artists', async (req: FastifyRequest<{ Querystring: { rootId?: string } }>) => {
    const { rootId } = req.query;
    const where: any = {};
    if (rootId) {
      where.tracks = { some: { rootId, isUnavailable: false } };
    }

    const artists = await prisma.artist.findMany({
      where,
      orderBy: { name: 'asc' },
      include: {
        _count: {
          select: {
            tracks: { where: { isUnavailable: false, ...(rootId ? { rootId } : {}) } },
            albums: rootId ? { where: { tracks: { some: { rootId, isUnavailable: false } } } } : true,
          },
        },
      },
    });

    return artists.map(a => ({
      id: a.id,
      name: a.name,
      trackCount: a._count.tracks,
      albumCount: a._count.albums,
    }));
  });

  function getQualityBadge(
    isLossless: boolean,
    maxBitDepth: number | null,
    maxSampleRate: number | null,
    maxBitrate: number | null,
    codec: string | null
  ): string {
    if (isLossless) {
      if ((maxBitDepth && maxBitDepth >= 24) || (maxSampleRate && maxSampleRate > 48000)) {
        return 'HI-RES';
      }
      const c = (codec || '').toUpperCase();
      if (c.includes('FLAC')) return 'FLAC';
      if (c.includes('ALAC')) return 'ALAC';
      if (c.includes('WAV') || c.includes('PCM')) return 'WAV';
      return 'LOSSLESS';
    }
    if (maxBitrate && maxBitrate >= 320) {
      return '320K';
    }
    if (maxBitrate && maxBitrate > 0) {
      return `${maxBitrate}K`;
    }
    return 'MP3';
  }

  app.get('/albums', async (req) => {
    const { artistId, rootId, search, searchField, sortBy, sortOrder, quality } = (req.query as {
      artistId?: string;
      rootId?: string;
      search?: string;
      searchField?: string;
      sortBy?: string;
      sortOrder?: 'asc' | 'desc';
      quality?: string;
    }) || {};

    const trackWhere: string[] = ['t.isUnavailable = 0'];
    const trackParams: any[] = [];

    const albumWhere: string[] = [];
    const albumParams: any[] = [];

    if (rootId) {
      trackWhere.push('t.rootId = ?');
      trackParams.push(rootId);
    }

    if (artistId) {
      albumWhere.push('a.artistId = ?');
      albumParams.push(artistId);
    }

    if (search && search.trim()) {
      const tokens = tokenize(search);
      const field = normalizeField(searchField);
      for (const tok of tokens) {
        const p = `%${tok}%`;
        if (field === 'album') {
          albumWhere.push('(a.title LIKE ? OR a.normalizedTitle LIKE ?)');
          albumParams.push(p, p);
        } else if (field === 'artist') {
          albumWhere.push('(art.name LIKE ? OR art.normalizedName LIKE ?)');
          albumParams.push(p, p);
        } else if (field === 'title') {
          trackWhere.push('(t.title LIKE ? OR t.filename LIKE ?)');
          trackParams.push(p, p);
        } else {
          albumWhere.push('(a.title LIKE ? OR a.normalizedTitle LIKE ? OR art.name LIKE ? OR art.normalizedName LIKE ?)');
          albumParams.push(p, p, p, p);
        }
      }
    }

    const havingConditions: string[] = [];
    if (quality === 'hires') {
      havingConditions.push('MAX(t.isLossless) = 1 AND (MAX(t.bitDepth) >= 24 OR MAX(t.sampleRate) > 48000)');
    } else if (quality === 'lossless') {
      havingConditions.push('MAX(t.isLossless) = 1');
    } else if (quality === '320k') {
      havingConditions.push('MAX(t.isLossless) = 0 AND MAX(t.bitrate) >= 320');
    } else if (quality === 'standard') {
      havingConditions.push('MAX(t.isLossless) = 0 AND MAX(t.bitrate) < 320');
    }

    const sortDir = sortOrder === 'desc' ? 'DESC' : 'ASC';
    let orderSql = 'art.name ASC, a.year ASC, a.title ASC';

    if (sortBy === 'albumArtist') {
      orderSql = `art.name ${sortDir}, a.year ASC, a.title ASC`;
    } else if (sortBy === 'artist') {
      orderSql = `art.name ${sortDir}, a.title ASC`;
    } else if (sortBy === 'year') {
      orderSql = `a.year ${sortDir}, a.title ASC`;
    } else if (sortBy === 'title') {
      orderSql = `a.title ${sortDir}`;
    } else if (sortBy === 'recent') {
      orderSql = `a.createdAt ${sortDir}`;
    } else if (sortBy === 'trackCount') {
      orderSql = `s.trackCount ${sortDir}, a.title ASC`;
    } else if (sortBy === 'quality') {
      orderSql = `s.isLossless ${sortDir}, s.maxBitDepth ${sortDir}, s.maxSampleRate ${sortDir}, s.maxBitrate ${sortDir}, a.title ASC`;
    }

    const trackWhereSql = trackWhere.length > 0 ? `WHERE ${trackWhere.join(' AND ')}` : '';
    const havingSql = havingConditions.length > 0 ? `HAVING ${havingConditions.join(' AND ')}` : '';
    const albumWhereSql = albumWhere.length > 0 ? `WHERE ${albumWhere.join(' AND ')}` : '';

    const sql = `
      WITH AlbumStats AS (
        SELECT 
          t.albumId,
          COUNT(t.id) as trackCount,
          MAX(t.isLossless) as isLossless,
          MAX(t.bitDepth) as maxBitDepth,
          MAX(t.sampleRate) as maxSampleRate,
          MAX(t.bitrate) as maxBitrate,
          MIN(t.codec) as primaryCodec
        FROM Track t
        ${trackWhereSql}
        GROUP BY t.albumId
        ${havingSql}
      )
      SELECT 
        a.id,
        a.title,
        a.year,
        a.artworkId,
        a.artistId,
        art.name as artistName,
        s.trackCount,
        s.isLossless,
        s.maxBitDepth,
        s.maxSampleRate,
        s.maxBitrate,
        s.primaryCodec
      FROM AlbumStats s
      JOIN Album a ON a.id = s.albumId
      LEFT JOIN Artist art ON art.id = a.artistId
      ${albumWhereSql}
      ORDER BY ${orderSql}
    `;

    const allParams = [...trackParams, ...albumParams];
    const rows = (await prisma.$queryRawUnsafe(sql, ...allParams)) as any[];

    return rows.map((r) => {
      const isLossless = Boolean(Number(r.isLossless));
      const maxBitDepth = r.maxBitDepth !== null ? Number(r.maxBitDepth) : null;
      const maxSampleRate = r.maxSampleRate !== null ? Number(r.maxSampleRate) : null;
      const maxBitrate = r.maxBitrate !== null ? Number(r.maxBitrate) : null;
      const primaryCodec = r.primaryCodec || null;
      const qualityBadge = getQualityBadge(isLossless, maxBitDepth, maxSampleRate, maxBitrate, primaryCodec);

      return {
        id: r.id,
        title: r.title,
        artistId: r.artistId,
        artistName: r.artistName || 'Unknown Artist',
        year: r.year,
        artworkId: r.artworkId,
        trackCount: Number(r.trackCount),
        isLossless,
        maxBitDepth,
        maxSampleRate,
        maxBitrate,
        primaryCodec,
        qualityBadge,
      };
    });
  });

  app.get('/genres', async () => {
    const tracks = await prisma.track.groupBy({
      by: ['genre'],
      where: {
        isUnavailable: false,
        genre: { not: null },
      },
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
    });

    return tracks
      .filter(t => t.genre)
      .map(t => ({
        genre: t.genre!,
        count: t._count.id,
      }));
  });

  // Physical Scans & Booklet Discovery
  app.get('/albums/:id/scans', async (req: FastifyRequest, reply) => {
    const { id } = req.params as { id: string };

    const sampleTrack = await prisma.track.findFirst({
      where: { albumId: id, isUnavailable: false },
      select: { fullPath: true },
    });

    if (!sampleTrack || !sampleTrack.fullPath) {
      return [];
    }

    const albumDir = path.dirname(sampleTrack.fullPath);
    if (!fs.existsSync(albumDir)) {
      return [];
    }

    const imageExts = new Set(['.jpg', '.jpeg', '.png', '.webp', '.avif', '.gif']);
    const scans: Array<{
      id: string;
      name: string;
      relPath: string;
      size: number;
      type: 'front' | 'back' | 'booklet' | 'disc' | 'inlay' | 'other';
    }> = [];

    const scanDirectory = (dir: string, baseDir: string, depth = 0) => {
      if (depth > 2) return;
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            if (/^(scans?|artwork|art|booklet|covers?|images?)$/i.test(entry.name)) {
              scanDirectory(fullPath, baseDir, depth + 1);
            }
          } else if (entry.isFile()) {
            const ext = path.extname(entry.name).toLowerCase();
            if (imageExts.has(ext)) {
              const rel = path.relative(baseDir, fullPath).replace(/\\/g, '/');
              const nameLower = entry.name.toLowerCase();
              let scanType: 'front' | 'back' | 'booklet' | 'disc' | 'inlay' | 'other' = 'other';

              if (/front|cover|folder/i.test(nameLower)) {
                scanType = 'front';
              } else if (/back|rear|tray|inlay/i.test(nameLower)) {
                scanType = 'back';
              } else if (/booklet|book|page|scan|liner|insert/i.test(nameLower)) {
                scanType = 'booklet';
              } else if (/cd|disc|disk|label|vinyl|tape|cassette/i.test(nameLower)) {
                scanType = 'disc';
              }

              let statSize = 0;
              try {
                statSize = fs.statSync(fullPath).size;
              } catch {}

              scans.push({
                id: Buffer.from(rel).toString('base64url'),
                name: entry.name,
                relPath: rel,
                size: statSize,
                type: scanType,
              });
            }
          }
        }
      } catch {
        // Ignore read errors
      }
    };

    scanDirectory(albumDir, albumDir);

    const typePriority: Record<string, number> = {
      front: 1,
      back: 2,
      booklet: 3,
      inlay: 4,
      disc: 5,
      other: 6,
    };

    scans.sort((a, b) => {
      const pDiff = (typePriority[a.type] || 9) - (typePriority[b.type] || 9);
      if (pDiff !== 0) return pDiff;
      return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
    });

    return scans;
  });

  // Serve physical scan file safely
  app.get('/albums/:id/scans/file', async (req: FastifyRequest, reply) => {
    const { id } = req.params as { id: string };
    const query = req.query as { relPath?: string };

    if (!query.relPath) {
      return reply.status(400).send({ error: 'Missing relPath parameter' });
    }

    const sampleTrack = await prisma.track.findFirst({
      where: { albumId: id, isUnavailable: false },
      select: { fullPath: true },
    });

    if (!sampleTrack || !sampleTrack.fullPath) {
      return reply.status(404).send({ error: 'Album not found' });
    }

    const albumDir = path.dirname(sampleTrack.fullPath);
    const targetPath = path.resolve(albumDir, query.relPath);

    // Guard against directory traversal
    const rel = path.relative(albumDir, targetPath);
    if (rel.startsWith('..') || path.isAbsolute(rel)) {
      return reply.status(403).send({ error: 'Invalid path access' });
    }

    if (!fs.existsSync(targetPath)) {
      return reply.status(404).send({ error: 'Scan file not found' });
    }

    const ext = path.extname(targetPath).toLowerCase();
    const mimeMap: Record<string, string> = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.webp': 'image/webp',
      '.avif': 'image/avif',
      '.gif': 'image/gif',
    };
    const contentType = mimeMap[ext] || 'application/octet-stream';

    reply.header('Content-Type', contentType);
    reply.header('Cache-Control', 'public, max-age=86400');
    return reply.send(fs.createReadStream(targetPath));
  });
}
