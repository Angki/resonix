import { FastifyInstance } from 'fastify';
import { prisma } from '../db.js';

export type SearchField = 'all' | 'album' | 'artist' | 'title';

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

      if (query.rootId) {
        whereConditions.push('t.rootId = ?');
        params.push(query.rootId);
      }
      if (query.artistId) {
        whereConditions.push('t.artistId = ?');
        params.push(query.artistId);
      }
      if (query.albumId) {
        whereConditions.push('t.albumId = ?');
        params.push(query.albumId);
      }
      if (query.genre) {
        whereConditions.push('t.genre LIKE ?');
        params.push(`%${query.genre}%`);
      }
      if (query.year) {
        whereConditions.push('t.year = ?');
        params.push(parseInt(query.year, 10));
      }

      const whereSql = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';
      const limitVal = Math.min(limit, 500);

      const randomRows = await prisma.$queryRawUnsafe<any[]>(
        `SELECT t.*, r.name as collectionName 
         FROM Track t 
         LEFT JOIN LibraryRoot r ON t.rootId = r.id 
         ${whereSql} 
         ORDER BY RANDOM() 
         LIMIT ${limitVal}`,
        ...params
      );

      const formatted = randomRows.map(t => ({
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
        isFavorite: false,
        rating: null,
        localPlayCount: 0,
        importedPlayCount: t.importedPlayCount || 0,
        combinedPlayCount: t.importedPlayCount || 0,
        lastPlayed: null,
        dateAdded: t.createdAt ? new Date(t.createdAt).toISOString() : new Date().toISOString(),
      }));

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

    const trackSearch = buildTrackSearch(query.search, normalizeField(query.searchField));
    if (trackSearch.length > 0) {
      where.AND = trackSearch;
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

  app.get('/artists', async () => {
    const artists = await prisma.artist.findMany({
      orderBy: { name: 'asc' },
      include: {
        _count: {
          select: {
            tracks: { where: { isUnavailable: false } },
            albums: true,
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

  app.get('/albums', async (req) => {
    const { artistId, rootId, search, searchField, sortBy, sortOrder } = (req.query as {
      artistId?: string;
      rootId?: string;
      search?: string;
      searchField?: string;
      sortBy?: string;
      sortOrder?: 'asc' | 'desc';
    }) || {};

    const where: any = {};
    const and: any[] = [];
    if (artistId) where.artistId = artistId;
    if (rootId) {
      and.push({ tracks: { some: { rootId, isUnavailable: false } } });
    }
    and.push(...buildAlbumSearch(search, normalizeField(searchField)));
    if (and.length > 0) where.AND = and;

    const sortDir = sortOrder === 'desc' ? 'desc' : 'asc';
    let orderBy: any = [{ title: 'asc' }, { year: 'desc' }];

    if (sortBy === 'albumArtist') {
      // MusicBee style: Artist Name -> Year -> Title
      orderBy = [{ artist: { name: sortDir } }, { year: 'asc' }, { title: 'asc' }];
    } else if (sortBy === 'artist') {
      orderBy = [{ artist: { name: sortDir } }, { title: 'asc' }];
    } else if (sortBy === 'year') {
      orderBy = [{ year: sortDir }, { title: 'asc' }];
    } else if (sortBy === 'title') {
      orderBy = [{ title: sortDir }];
    } else if (sortBy === 'recent') {
      orderBy = [{ createdAt: sortDir }];
    } else if (sortBy === 'trackCount') {
      orderBy = [{ tracks: { _count: sortDir } }, { title: 'asc' }];
    }

    const albums = await prisma.album.findMany({
      where,
      orderBy,
      include: {
        artist: { select: { id: true, name: true } },
        _count: {
          select: {
            tracks: {
              where: {
                isUnavailable: false,
                ...(rootId ? { rootId } : {}),
              },
            },
          },
        },
      },
    });

    return albums.map(a => ({
      id: a.id,
      title: a.title,
      artistId: a.artistId,
      artistName: a.artist?.name || 'Unknown Artist',
      year: a.year,
      artworkId: a.artworkId,
      trackCount: a._count.tracks,
    }));
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
}
