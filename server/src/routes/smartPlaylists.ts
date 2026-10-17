import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../db.js';

export interface SmartPlaylistDef {
  key: string;
  title: string;
  description: string;
  icon: 'Flame' | 'Clock' | 'Gem' | 'Hourglass' | 'Archive';
}

export const SMART_PLAYLISTS: SmartPlaylistDef[] = [
  {
    key: 'top-played',
    title: 'Top 100 Most Played',
    description: 'Track paling sering diputar di seluruh library',
    icon: 'Flame',
  },
  {
    key: 'recently-added',
    title: 'Recently Added',
    description: 'Album dan track yang baru ditambahkan ke library',
    icon: 'Clock',
  },
  {
    key: 'lossless-vault',
    title: 'Pure Lossless Vault',
    description: 'Koleksi track berkualitas murni FLAC & WAV',
    icon: 'Gem',
  },
  {
    key: 'epic-length',
    title: 'Epic Length (> 10 Min)',
    description: 'Track berdurasi panjang, atmosferik & dungeon synth',
    icon: 'Hourglass',
  },
  {
    key: 'forgotten-relics',
    title: 'Forgotten Relics',
    description: 'Koleksi tersembunyi yang belum pernah diputar sama sekali',
    icon: 'Archive',
  },
];

function formatTrack(t: any) {
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
}

export async function smartPlaylistsRoutes(app: FastifyInstance) {
  // 1. Get catalog of all smart playlists
  app.get('/', async () => {
    // Return presets with live track counts
    const presetsWithCounts = await Promise.all(
      SMART_PLAYLISTS.map(async (p) => {
        let count = 0;
        try {
          if (p.key === 'top-played') {
            const res = await prisma.$queryRawUnsafe<any[]>(
              `SELECT COUNT(*) as cnt FROM Track t 
               LEFT JOIN UserTrackStats us ON t.id = us.trackId 
               WHERE t.isUnavailable = 0 AND (COALESCE(us.playCount, 0) + COALESCE(t.importedPlayCount, 0)) > 0`
            );
            count = Math.min(100, Number(res[0]?.cnt || 0));
          } else if (p.key === 'recently-added') {
            const res = await prisma.$queryRawUnsafe<any[]>(
              `SELECT COUNT(*) as cnt FROM Track WHERE isUnavailable = 0`
            );
            count = Math.min(100, Number(res[0]?.cnt || 0));
          } else if (p.key === 'lossless-vault') {
            const res = await prisma.$queryRawUnsafe<any[]>(
              `SELECT COUNT(*) as cnt FROM Track WHERE isUnavailable = 0 AND isLossless = 1`
            );
            count = Math.min(150, Number(res[0]?.cnt || 0));
          } else if (p.key === 'epic-length') {
            const res = await prisma.$queryRawUnsafe<any[]>(
              `SELECT COUNT(*) as cnt FROM Track WHERE isUnavailable = 0 AND duration >= 600`
            );
            count = Math.min(100, Number(res[0]?.cnt || 0));
          } else if (p.key === 'forgotten-relics') {
            const res = await prisma.$queryRawUnsafe<any[]>(
              `SELECT COUNT(*) as cnt FROM Track t 
               LEFT JOIN UserTrackStats us ON t.id = us.trackId 
               WHERE t.isUnavailable = 0 AND COALESCE(us.playCount, 0) = 0 AND COALESCE(t.importedPlayCount, 0) = 0`
            );
            count = Math.min(100, Number(res[0]?.cnt || 0));
          }
        } catch {
          count = 0;
        }

        return {
          ...p,
          trackCount: count,
        };
      })
    );

    return presetsWithCounts;
  });

  // 2. Get tracks for a specific smart playlist preset
  app.get('/:key', async (req: FastifyRequest<{ Params: { key: string } }>, reply: FastifyReply) => {
    const { key } = req.params;
    const preset = SMART_PLAYLISTS.find(p => p.key === key);
    if (!preset) {
      return reply.status(404).send({ error: `Smart playlist preset '${key}' not found` });
    }

    let rows: any[] = [];
    const baseSelect = `
      SELECT t.*, r.name as collectionName,
             COALESCE(us.playCount, 0) as userPlayCount,
             COALESCE(t.importedPlayCount, 0) as importedPlayCount,
             (COALESCE(us.playCount, 0) + COALESCE(t.importedPlayCount, 0)) as combinedCount,
             us.isFavorite as userFavorite,
             us.rating as userRating,
             us.lastPlayedAt as userLastPlayed
      FROM Track t
      LEFT JOIN LibraryRoot r ON t.rootId = r.id
      LEFT JOIN UserTrackStats us ON t.id = us.trackId
    `;

    if (key === 'top-played') {
      rows = await prisma.$queryRawUnsafe<any[]>(
        `${baseSelect}
         WHERE t.isUnavailable = 0 AND (COALESCE(us.playCount, 0) + COALESCE(t.importedPlayCount, 0)) > 0
         ORDER BY combinedCount DESC
         LIMIT 100`
      );
    } else if (key === 'recently-added') {
      rows = await prisma.$queryRawUnsafe<any[]>(
        `${baseSelect}
         WHERE t.isUnavailable = 0
         ORDER BY t.createdAt DESC
         LIMIT 100`
      );
    } else if (key === 'lossless-vault') {
      rows = await prisma.$queryRawUnsafe<any[]>(
        `${baseSelect}
         WHERE t.isUnavailable = 0 AND t.isLossless = 1
         ORDER BY RANDOM()
         LIMIT 150`
      );
    } else if (key === 'epic-length') {
      rows = await prisma.$queryRawUnsafe<any[]>(
        `${baseSelect}
         WHERE t.isUnavailable = 0 AND t.duration >= 600
         ORDER BY t.duration DESC
         LIMIT 100`
      );
    } else if (key === 'forgotten-relics') {
      rows = await prisma.$queryRawUnsafe<any[]>(
        `${baseSelect}
         WHERE t.isUnavailable = 0 
           AND COALESCE(us.playCount, 0) = 0 
           AND COALESCE(t.importedPlayCount, 0) = 0
         ORDER BY RANDOM()
         LIMIT 100`
      );
    }

    const tracks = rows.map(formatTrack);
    const totalDuration = tracks.reduce((acc, t) => acc + (t.duration || 0), 0);

    return {
      preset,
      totalDuration,
      trackCount: tracks.length,
      tracks,
    };
  });
}
