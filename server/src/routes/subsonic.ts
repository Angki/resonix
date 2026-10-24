import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import crypto from 'crypto';
import path from 'path';
import { prisma } from '../db.js';
import { verifyPassword, encryptSecret, decryptSecret } from '../crypto.js';
import { handleStreamRequest, MIME_TYPES } from '../streaming/streamer.js';
import { getArtworkThumbnail } from '../library/artwork.js';
import { config } from '../config.js';
import { startPlaybackSession, reportPlaybackProgress } from '../playback/tracker.js';
import { lyricsService } from '../lyrics/lyricsService.js';
import { getScanStatus, runLibraryScan } from '../library/scanner.js';
import {
  buildStructuredLyrics,
  normalizePlayQueue,
  buildPlayQueuePayload,
  buildFolderChild,
  normalizeBookmarks,
} from './subsonicHelpers.js';

const SUBSONIC_API_VERSION = '1.16.1';
const SERVER_VERSION = '1.0.0';
const SERVER_TYPE = 'resonix';

const FALLBACK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256" fill="#18181b">
  <rect width="256" height="256" fill="#18181b"/>
  <circle cx="128" cy="128" r="64" fill="#27272a" stroke="#3f3f46" stroke-width="4"/>
  <circle cx="128" cy="128" r="20" fill="#991b1b"/>
  <circle cx="128" cy="128" r="6" fill="#18181b"/>
</svg>`;

interface SubsonicAuthResult {
  authenticated: boolean;
  user?: { id: string; username: string; role: string };
  errorCode?: number;
  errorMessage?: string;
}

/**
 * OpenSubsonic / Subsonic Authentication
 * Supports:
 * 1. Token + Salt: t = md5(password + salt)
 * 2. Cleartext / Hex: p = password or p = enc:hex
 */
async function authenticateSubsonic(params: Record<string, any>): Promise<SubsonicAuthResult> {
  const { u, p, t, s } = params;
  if (!u) {
    return { authenticated: false, errorCode: 10, errorMessage: 'Required parameter missing: u' };
  }

  const user = await prisma.user.findUnique({
    where: { username: u },
    select: { id: true, username: true, role: true, passwordHash: true },
  });

  if (!user) {
    return { authenticated: false, errorCode: 40, errorMessage: 'Wrong username or password' };
  }

  // 1. Token + Salt (Recommended modern standard for Subsonic)
  if (t && s) {
    const subsonicSetting = await prisma.setting.findUnique({
      where: { key: `subsonic_pw_${user.id}` },
    });

    if (subsonicSetting?.value) {
      const plainPassword = decryptSecret(subsonicSetting.value);
      if (plainPassword) {
        const expectedToken = crypto.createHash('md5').update(plainPassword + s).digest('hex').toLowerCase();
        if (t.toLowerCase() === expectedToken) {
          return { authenticated: true, user };
        }
      }
    }

    return { authenticated: false, errorCode: 40, errorMessage: 'Wrong username or password' };
  }

  // 2. Plain password or Hex encoded (p parameter)
  if (p) {
    let plain = p;
    if (typeof p === 'string' && p.startsWith('enc:')) {
      try {
        plain = Buffer.from(p.slice(4), 'hex').toString('utf8');
      } catch {
        plain = p;
      }
    }

    // Verify against user password hash
    const isValid = await verifyPassword(plain, user.passwordHash);
    if (isValid) {
      // Auto-cache encrypted password so token+salt auth works seamlessly on next requests
      await prisma.setting.upsert({
        where: { key: `subsonic_pw_${user.id}` },
        update: { value: encryptSecret(plain) },
        create: { key: `subsonic_pw_${user.id}`, value: encryptSecret(plain) },
      });
      return { authenticated: true, user };
    }

    // Also check dedicated subsonic app password
    const subsonicSetting = await prisma.setting.findUnique({
      where: { key: `subsonic_pw_${user.id}` },
    });
    if (subsonicSetting?.value) {
      const savedPlain = decryptSecret(subsonicSetting.value);
      if (savedPlain === plain) {
        return { authenticated: true, user };
      }
    }

    return { authenticated: false, errorCode: 40, errorMessage: 'Wrong username or password' };
  }

  return { authenticated: false, errorCode: 10, errorMessage: 'Required authentication parameter missing (p or t+s)' };
}

/**
 * Escape XML special characters
 */
function escapeXml(unsafe: any): string {
  if (unsafe === null || unsafe === undefined) return '';
  return String(unsafe)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Lightweight XML Serializer matching Subsonic XML schema
 */
function serializeToXml(obj: any, indent = 2): string {
  const pad = ' '.repeat(indent);
  let xml = '';

  for (const [key, val] of Object.entries(obj)) {
    if (val === null || val === undefined) continue;

    if (Array.isArray(val)) {
      for (const item of val) {
        xml += serializeElement(key, item, indent);
      }
    } else if (typeof val === 'object') {
      xml += serializeElement(key, val, indent);
    }
  }

  return xml;
}

function serializeElement(tag: string, data: any, indent: number): string {
  const pad = ' '.repeat(indent);
  if (typeof data !== 'object' || data === null) {
    return `${pad}<${tag}>${escapeXml(data)}</${tag}>\n`;
  }

  const attrs: string[] = [];
  const children: Array<{ key: string; val: any }> = [];

  for (const [k, v] of Object.entries(data)) {
    if (v === null || v === undefined) continue;
    if (typeof v === 'object' || Array.isArray(v)) {
      children.push({ key: k, val: v });
    } else {
      attrs.push(`${k}="${escapeXml(v)}"`);
    }
  }

  const attrStr = attrs.length > 0 ? ' ' + attrs.join(' ') : '';

  if (children.length === 0) {
    return `${pad}<${tag}${attrStr}/>\n`;
  }

  let innerXml = '';
  for (const child of children) {
    if (Array.isArray(child.val)) {
      for (const item of child.val) {
        innerXml += serializeElement(child.key, item, indent + 2);
      }
    } else {
      innerXml += serializeElement(child.key, child.val, indent + 2);
    }
  }

  return `${pad}<${tag}${attrStr}>\n${innerXml}${pad}</${tag}>\n`;
}

/**
 * Send standard Subsonic response in requested format (JSON or XML)
 */
function sendSubsonicResponse(
  reply: FastifyReply,
  format: string,
  payload: Record<string, any> = {}
) {
  const isJson = format.toLowerCase() === 'json';

  if (isJson) {
    reply.header('Content-Type', 'application/json; charset=utf-8');
    return reply.send({
      'subsonic-response': {
        status: 'ok',
        version: SUBSONIC_API_VERSION,
        type: SERVER_TYPE,
        serverVersion: SERVER_VERSION,
        openSubsonic: true,
        ...payload,
      },
    });
  }

  // XML Output
  reply.header('Content-Type', 'application/xml; charset=utf-8');
  let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
  xml += `<subsonic-response xmlns="http://subsonic.org/restapi" status="ok" version="${SUBSONIC_API_VERSION}" type="${SERVER_TYPE}" serverVersion="${SERVER_VERSION}" openSubsonic="true">\n`;
  xml += serializeToXml(payload, 2);
  xml += `</subsonic-response>`;
  return reply.send(xml);
}

/**
 * Send standard Subsonic error response
 */
function sendSubsonicError(
  reply: FastifyReply,
  format: string,
  code: number,
  message: string
) {
  const isJson = format.toLowerCase() === 'json';

  if (isJson) {
    reply.header('Content-Type', 'application/json; charset=utf-8');
    return reply.send({
      'subsonic-response': {
        status: 'failed',
        version: SUBSONIC_API_VERSION,
        type: SERVER_TYPE,
        serverVersion: SERVER_VERSION,
        openSubsonic: true,
        error: {
          code,
          message,
        },
      },
    });
  }

  reply.header('Content-Type', 'application/xml; charset=utf-8');
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<subsonic-response xmlns="http://subsonic.org/restapi" status="failed" version="${SUBSONIC_API_VERSION}" type="${SERVER_TYPE}" serverVersion="${SERVER_VERSION}">\n  <error code="${code}" message="${escapeXml(message)}"/>\n</subsonic-response>`;
  return reply.send(xml);
}

/**
 * Format Track to Subsonic Song format
 */
function formatSubsonicSong(track: any) {
  const ext = (track.extension || '').replace('.', '').toLowerCase();
  const mimeType = MIME_TYPES[`.${ext}`] || 'audio/mpeg';

  return {
    id: track.id,
    parent: track.albumId || '',
    isDir: false,
    title: track.title,
    album: track.albumTitle || 'Unknown Album',
    artist: track.artistName || 'Unknown Artist',
    track: track.trackNumber || 1,
    year: track.year || undefined,
    genre: track.genre || undefined,
    coverArt: track.artworkId || track.album?.artworkId || track.id,
    size: Number(track.fileSize || 0),
    contentType: mimeType,
    suffix: ext,
    duration: Math.round(track.duration || 0),
    bitRate: track.bitrate || 320,
    path: track.relativePath || track.filename,
    discNumber: track.discNumber || 1,
    artistId: track.artistId || undefined,
    albumId: track.albumId || undefined,
    type: 'music',
    isVideo: false,
    created: track.createdAt ? new Date(track.createdAt).toISOString() : undefined,
    playCount: track.userStats?.[0]?.playCount || track.importedPlayCount || 0,
    starred: track.userStats?.[0]?.isFavorite ? new Date().toISOString() : undefined,
    userRating: track.userStats?.[0]?.rating ? Math.round(track.userStats[0].rating / 20) : undefined,
  };
}

/**
 * Format Album to Subsonic Album format
 */
function formatSubsonicAlbum(album: any) {
  const songCount = album._count?.tracks || album.tracks?.length || 0;
  const duration = album.tracks
    ? album.tracks.reduce((acc: number, t: any) => acc + (t.duration || 0), 0)
    : 0;

  return {
    id: album.id,
    name: album.title,
    title: album.title,
    artist: album.artist?.name || 'Unknown Artist',
    artistId: album.artistId || undefined,
    coverArt: album.artworkId || album.id,
    songCount,
    duration: Math.round(duration),
    year: album.year || undefined,
    genre: album.tracks?.[0]?.genre || undefined,
    created: album.createdAt ? new Date(album.createdAt).toISOString() : undefined,
  };
}

function getBaseUrl(req: FastifyRequest): string {
  const host = req.headers.host || `localhost:${config.PORT}`;
  return `${req.protocol}://${host}`;
}

function coverArtUrl(req: FastifyRequest, id: string, size: number): string {
  return `${getBaseUrl(req)}/rest/getCoverArt?id=${encodeURIComponent(id)}&size=${size}`;
}

function shuffleList<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function parseCachedSimilarArtistIds(similarArtists: string | null): string[] {
  if (!similarArtists) return [];
  try {
    const parsed = JSON.parse(similarArtists);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item: any) => item?.inLibrary && typeof item.libraryArtistId === 'string')
      .map((item: any) => item.libraryArtistId as string);
  } catch {
    return [];
  }
}

const playQueueKey = (userId: string) => `subsonic_playqueue_${userId}`;
const bookmarksKey = (userId: string) => `subsonic_bookmarks_${userId}`;

export async function subsonicRoutes(app: FastifyInstance) {
  // Main handler for all Subsonic endpoints (/rest/{method} or /rest/{method}.view)
  app.all('/:method', async (req: FastifyRequest, reply: FastifyReply) => {
    const rawMethod = ((req.params as any).method || '').toLowerCase();
    const method = rawMethod.replace(/\.view$/, '');

    const params: Record<string, any> = {
      ...(req.query as Record<string, any>),
      ...((req.body as Record<string, any>) || {}),
    };

    const format = params.f || (req.headers.accept?.includes('application/json') ? 'json' : 'xml');

    // Authentication check
    const auth = await authenticateSubsonic(params);
    if (!auth.authenticated) {
      return sendSubsonicError(reply, format, auth.errorCode || 40, auth.errorMessage || 'Authentication failed');
    }

    const user = auth.user!;

    switch (method) {
      // 1. Ping & Connectivity
      case 'ping': {
        return sendSubsonicResponse(reply, format);
      }

      // 2. License Check
      case 'getlicense': {
        return sendSubsonicResponse(reply, format, {
          license: {
            valid: true,
            email: `${user.username}@blacklibrary.local`,
            licenseExpires: '2099-12-31T23:59:59Z',
            trialExpires: '2099-12-31T23:59:59Z',
          },
        });
      }

      // 3. OpenSubsonic Extensions
      case 'getopensubsonicextensions': {
        return sendSubsonicResponse(reply, format, {
          openSubsonicExtensions: [
            { name: 'formPost', versions: [1] },
            { name: 'transcoding', versions: [1] },
            { name: 'search3', versions: [1] },
            { name: 'songLyrics', versions: [1] },
          ],
        });
      }

      // 4. Music Folders (Library Roots)
      case 'getmusicfolders': {
        const roots = await prisma.libraryRoot.findMany({
          where: { isEnabled: true },
          orderBy: { name: 'asc' },
        });

        const musicFolders = roots.map((r, idx) => ({
          id: idx + 1,
          name: r.name,
        }));

        return sendSubsonicResponse(reply, format, {
          musicFolders: {
            musicFolder: musicFolders,
          },
        });
      }

      // 5. Indexes (Alphabetical grouping of Artists)
      case 'getindexes': {
        const artists = await prisma.artist.findMany({
          orderBy: { name: 'asc' },
          include: {
            _count: { select: { albums: true } },
          },
        });

        const indexMap: Record<string, any[]> = {};

        for (const artist of artists) {
          const firstChar = artist.name.trim().charAt(0).toUpperCase();
          const letter = /^[A-Z]$/.test(firstChar) ? firstChar : '#';
          if (!indexMap[letter]) indexMap[letter] = [];
          indexMap[letter].push({
            id: artist.id,
            name: artist.name,
            coverArt: artist.id,
            albumCount: artist._count.albums,
          });
        }

        const sortedKeys = Object.keys(indexMap).sort((a, b) => {
          if (a === '#') return 1;
          if (b === '#') return -1;
          return a.localeCompare(b);
        });

        const index = sortedKeys.map(k => ({
          name: k,
          artist: indexMap[k],
        }));

        return sendSubsonicResponse(reply, format, {
          indexes: {
            lastModified: Date.now(),
            ignoredArticles: 'The El La Los Las Le Les Das Der Die',
            index,
          },
        });
      }

      // 6. Artists List
      case 'getartists': {
        const artists = await prisma.artist.findMany({
          orderBy: { name: 'asc' },
          include: {
            _count: { select: { albums: true } },
          },
        });

        const indexMap: Record<string, any[]> = {};

        for (const artist of artists) {
          const firstChar = artist.name.trim().charAt(0).toUpperCase();
          const letter = /^[A-Z]$/.test(firstChar) ? firstChar : '#';
          if (!indexMap[letter]) indexMap[letter] = [];
          indexMap[letter].push({
            id: artist.id,
            name: artist.name,
            coverArt: artist.id,
            albumCount: artist._count.albums,
          });
        }

        const sortedKeys = Object.keys(indexMap).sort((a, b) => {
          if (a === '#') return 1;
          if (b === '#') return -1;
          return a.localeCompare(b);
        });

        const index = sortedKeys.map(k => ({
          name: k,
          artist: indexMap[k],
        }));

        return sendSubsonicResponse(reply, format, {
          artists: {
            ignoredArticles: 'The El La Los Las Le Les Das Der Die',
            index,
          },
        });
      }

      // 7. Artist Detail
      case 'getartist': {
        const artistId = params.id;
        if (!artistId) {
          return sendSubsonicError(reply, format, 10, 'Required parameter missing: id');
        }

        const artist = await prisma.artist.findUnique({
          where: { id: artistId },
          include: {
            albums: {
              include: {
                _count: { select: { tracks: true } },
                tracks: { select: { duration: true, genre: true } },
              },
              orderBy: { year: 'desc' },
            },
          },
        });

        if (!artist) {
          return sendSubsonicError(reply, format, 70, 'Artist not found');
        }

        const albums = artist.albums.map(formatSubsonicAlbum);

        return sendSubsonicResponse(reply, format, {
          artist: {
            id: artist.id,
            name: artist.name,
            coverArt: artist.id,
            albumCount: albums.length,
            album: albums,
          },
        });
      }

      // 7b. Artist Info (biography + similar artists + images)
      case 'getartistinfo':
      case 'getartistinfo2': {
        const artistId = params.id;
        if (!artistId) {
          return sendSubsonicError(reply, format, 10, 'Required parameter missing: id');
        }

        const artist = await prisma.artist.findUnique({ where: { id: artistId } });
        if (!artist) {
          return sendSubsonicError(reply, format, 70, 'Artist not found');
        }

        const similarIds = parseCachedSimilarArtistIds(artist.similarArtists);
        const similar =
          similarIds.length > 0
            ? await prisma.artist.findMany({
                where: { id: { in: similarIds } },
                select: { id: true, name: true, _count: { select: { albums: true } } },
              })
            : [];

        const photoUrl = `${getBaseUrl(req)}/api/artists/${encodeURIComponent(artist.id)}/photo`;
        const info = {
          biography: artist.bio || undefined,
          similarArtist: similar.map((item) => ({
            id: item.id,
            name: item.name,
            albumCount: item._count.albums,
            coverArt: item.id,
          })),
          smallImageUrl: photoUrl,
          mediumImageUrl: photoUrl,
          largeImageUrl: photoUrl,
        };

        const responseKey = method === 'getartistinfo2' ? 'artistInfo2' : 'artistInfo';
        return sendSubsonicResponse(reply, format, { [responseKey]: info });
      }

      // 7c. Browse a directory (artist -> albums, album -> songs)
      case 'getmusicdirectory': {
        const directoryId = params.id;
        if (!directoryId) {
          return sendSubsonicError(reply, format, 10, 'Required parameter missing: id');
        }

        const artist = await prisma.artist.findUnique({
          where: { id: directoryId },
          include: {
            albums: {
              include: { _count: { select: { tracks: true } } },
              orderBy: [{ year: 'asc' }, { title: 'asc' }],
            },
          },
        });

        if (artist) {
          return sendSubsonicResponse(reply, format, {
            directory: {
              id: artist.id,
              name: artist.name,
              child: artist.albums.map((album) =>
                buildFolderChild({
                  kind: 'album',
                  id: album.id,
                  parent: artist.id,
                  title: album.title,
                  artist: artist.name,
                  year: album.year,
                  coverArt: album.artworkId || album.id,
                  songCount: album._count.tracks,
                  created: album.createdAt ? album.createdAt.toISOString() : null,
                })
              ),
            },
          });
        }

        const album = await prisma.album.findUnique({
          where: { id: directoryId },
          include: {
            artist: true,
            tracks: {
              include: {
                album: true,
                userStats: { where: { userId: user.id } },
              },
              orderBy: [{ discNumber: 'asc' }, { trackNumber: 'asc' }],
            },
          },
        });

        if (album) {
          return sendSubsonicResponse(reply, format, {
            directory: {
              id: album.id,
              parent: album.artistId || undefined,
              name: album.title,
              child: album.tracks.map((track) =>
                buildFolderChild({ kind: 'song', song: formatSubsonicSong(track) }, album.id)
              ),
            },
          });
        }

        return sendSubsonicError(reply, format, 70, 'Directory not found');
      }

      // 8. Album Detail
      case 'getalbum': {
        const albumId = params.id;
        if (!albumId) {
          return sendSubsonicError(reply, format, 10, 'Required parameter missing: id');
        }

        const album = await prisma.album.findUnique({
          where: { id: albumId },
          include: {
            artist: true,
            tracks: {
              where: { isUnavailable: false },
              include: {
                userStats: { where: { userId: user.id } },
              },
              orderBy: [{ discNumber: 'asc' }, { trackNumber: 'asc' }],
            },
          },
        });

        if (!album) {
          return sendSubsonicError(reply, format, 70, 'Album not found');
        }

        const songs = album.tracks.map(formatSubsonicSong);
        const duration = album.tracks.reduce((acc, t) => acc + (t.duration || 0), 0);

        return sendSubsonicResponse(reply, format, {
          album: {
            id: album.id,
            name: album.title,
            title: album.title,
            artist: album.artist?.name || 'Unknown Artist',
            artistId: album.artistId || undefined,
            coverArt: album.artworkId || album.id,
            songCount: songs.length,
            duration: Math.round(duration),
            year: album.year || undefined,
            genre: songs[0]?.genre || undefined,
            song: songs,
          },
        });
      }

      // 8b. Album Info (images; the model has no free-form notes yet)
      case 'getalbuminfo':
      case 'getalbuminfo2': {
        const albumId = params.id;
        if (!albumId) {
          return sendSubsonicError(reply, format, 10, 'Required parameter missing: id');
        }

        const album = await prisma.album.findUnique({
          where: { id: albumId },
          select: { id: true, artworkId: true },
        });
        if (!album) {
          return sendSubsonicError(reply, format, 70, 'Album not found');
        }

        const artId = album.artworkId || album.id;
        const info = {
          smallImageUrl: coverArtUrl(req, artId, 300),
          mediumImageUrl: coverArtUrl(req, artId, 600),
          largeImageUrl: coverArtUrl(req, artId, 1000),
        };

        const responseKey = method === 'getalbuminfo2' ? 'albumInfo2' : 'albumInfo';
        return sendSubsonicResponse(reply, format, { [responseKey]: info });
      }

      // 8c. Similar Songs (uses cached Last.fm similar artists, then genre fallback)
      case 'getsimilarsongs':
      case 'getsimilarsongs2': {
        const seedId = params.id;
        if (!seedId) {
          return sendSubsonicError(reply, format, 10, 'Required parameter missing: id');
        }
        const count = Math.min(100, Math.max(1, parseInt(params.count || '50', 10) || 50));

        let seedTrack: any = null;
        let seedArtist: any = null;

        if (method === 'getsimilarsongs2') {
          seedArtist = await prisma.artist.findUnique({ where: { id: seedId } });
        } else {
          seedTrack = await prisma.track.findUnique({ where: { id: seedId } });
          if (seedTrack?.artistId) {
            seedArtist = await prisma.artist.findUnique({ where: { id: seedTrack.artistId } });
          }
        }

        if (!seedArtist && !seedTrack) {
          return sendSubsonicError(reply, format, 70, 'Artist or song not found');
        }

        const artistIds = new Set<string>();
        if (seedArtist) {
          artistIds.add(seedArtist.id);
          for (const id of parseCachedSimilarArtistIds(seedArtist.similarArtists)) {
            artistIds.add(id);
          }
        }

        const seedGenre = seedTrack?.genre?.trim() || undefined;
        const filters: any[] = [];
        if (artistIds.size > 0) filters.push({ artistId: { in: [...artistIds] } });
        if (seedGenre) filters.push({ genre: { equals: seedGenre } });

        const candidates = await prisma.track.findMany({
          where: {
            isUnavailable: false,
            ...(seedTrack ? { id: { not: seedTrack.id } } : {}),
            ...(filters.length > 0 ? { OR: filters } : {}),
          },
          include: {
            album: true,
            userStats: { where: { userId: user.id } },
          },
          take: Math.max(count * 4, 50),
        });

        const songs = shuffleList(candidates).slice(0, count).map(formatSubsonicSong);
        return sendSubsonicResponse(reply, format, {
          similarSongs2: { song: songs },
        });
      }

      // 8d. Songs by Genre
      case 'getsongsbygenre': {
        const genre = typeof params.genre === 'string' ? params.genre.trim() : '';
        if (!genre) {
          return sendSubsonicError(reply, format, 10, 'Required parameter missing: genre');
        }

        const count = Math.min(500, Math.max(1, parseInt(params.count || '50', 10) || 50));
        const offset = Math.max(0, parseInt(params.offset || '0', 10) || 0);

        const [tracks, total] = await Promise.all([
          prisma.track.findMany({
            where: { isUnavailable: false, genre: { contains: genre } },
            include: {
              album: true,
              userStats: { where: { userId: user.id } },
            },
            orderBy: [{ artistName: 'asc' }, { albumTitle: 'asc' }, { discNumber: 'asc' }, { trackNumber: 'asc' }],
            take: count,
            skip: offset,
          }),
          prisma.track.count({ where: { isUnavailable: false, genre: { contains: genre } } }),
        ]);

        return sendSubsonicResponse(reply, format, {
          songsByGenre: {
            song: tracks.map(formatSubsonicSong),
            total,
          },
        });
      }

      // 9. Song Detail
      case 'getsong': {
        const songId = params.id;
        if (!songId) {
          return sendSubsonicError(reply, format, 10, 'Required parameter missing: id');
        }

        const track = await prisma.track.findUnique({
          where: { id: songId },
          include: {
            album: true,
            artist: true,
            userStats: { where: { userId: user.id } },
          },
        });

        if (!track) {
          return sendSubsonicError(reply, format, 70, 'Song not found');
        }

        return sendSubsonicResponse(reply, format, {
          song: formatSubsonicSong(track),
        });
      }

      // 10. Genres List
      case 'getgenres': {
        const rows = await prisma.$queryRawUnsafe<any[]>(
          `
          SELECT trim(genre) AS name, COUNT(*) AS songCount, COUNT(DISTINCT albumId) AS albumCount
          FROM Track
          WHERE genre IS NOT NULL AND trim(genre) <> '' AND isUnavailable = 0
          GROUP BY trim(genre)
          ORDER BY songCount DESC
          `
        );

        const genres = rows.map((row) => ({
          value: String(row.name),
          songCount: Number(row.songCount || 0),
          albumCount: Number(row.albumCount || 0),
        }));

        return sendSubsonicResponse(reply, format, {
          genres: {
            genre: genres,
          },
        });
      }

      // 11. Album Lists (getAlbumList & getAlbumList2)
      case 'getalbumlist':
      case 'getalbumlist2': {
        const type = (params.type || 'newest').toLowerCase();
        const size = Math.min(500, Math.max(1, parseInt(params.size || '20', 10)));
        const offset = Math.max(0, parseInt(params.offset || '0', 10));

        let orderBy: any = { createdAt: 'desc' };
        if (type === 'alphabeticalbyname' || type === 'bygenre' || type === 'starred') {
          orderBy = { title: 'asc' };
        } else if (type === 'alphabeticalbyartist') {
          orderBy = { artist: { name: 'asc' } };
        } else if (type === 'byyear') {
          orderBy = { year: 'desc' };
        } else if (type === 'recent') {
          orderBy = { updatedAt: 'desc' };
        }

        const where: any = {};
        if (type === 'bygenre') {
          if (!params.genre) {
            return sendSubsonicError(reply, format, 10, 'Required parameter missing: genre');
          }
          where.tracks = { some: { genre: { contains: String(params.genre) }, isUnavailable: false } };
        } else if (type === 'starred') {
          where.tracks = {
            some: {
              isUnavailable: false,
              userStats: { some: { userId: user.id, isFavorite: true } },
            },
          };
        }

        let skip = offset;
        if (type === 'random') {
          const total = await prisma.album.count({ where });
          skip = Math.max(0, Math.floor(Math.random() * Math.max(1, total - size)));
          orderBy = { title: 'asc' };
        }

        const albums = await prisma.album.findMany({
          where,
          orderBy,
          take: size,
          skip,
          include: {
            artist: true,
            _count: { select: { tracks: true } },
            tracks: { select: { duration: true, genre: true } },
          },
        });

        const albumList = albums.map(formatSubsonicAlbum);

        const responseKey = method === 'getalbumlist2' ? 'albumList2' : 'albumList';
        return sendSubsonicResponse(reply, format, {
          [responseKey]: {
            album: albumList,
          },
        });
      }

      // 12. Random Songs
      case 'getrandomsongs': {
        const size = Math.min(100, Math.max(1, parseInt(params.size || '20', 10)));

        const where: any = { isUnavailable: false };
        if (params.genre) where.genre = { contains: String(params.genre) };

        const fromYear = parseInt(params.fromYear, 10);
        const toYear = parseInt(params.toYear, 10);
        if (Number.isFinite(fromYear) || Number.isFinite(toYear)) {
          where.year = {
            ...(Number.isFinite(fromYear) ? { gte: fromYear } : {}),
            ...(Number.isFinite(toYear) ? { lte: toYear } : {}),
          };
        }

        const totalTracks = await prisma.track.count({ where });
        const randomSkip = Math.max(0, Math.floor(Math.random() * Math.max(1, totalTracks - size)));

        const tracks = await prisma.track.findMany({
          where,
          skip: randomSkip,
          take: size,
          include: {
            album: true,
            artist: true,
            userStats: { where: { userId: user.id } },
          },
        });

        const songs = tracks.map(formatSubsonicSong);

        return sendSubsonicResponse(reply, format, {
          randomSongs: {
            song: songs,
          },
        });
      }

      // 13. Search (search2 & search3)
      case 'search2':
      case 'search3': {
        const query = (params.query || '').trim();
        if (!query) {
          const responseKey = method === 'search3' ? 'searchResult3' : 'searchResult2';
          return sendSubsonicResponse(reply, format, { [responseKey]: {} });
        }

        const artistCount = Math.min(50, parseInt(params.artistCount || '20', 10));
        const albumCount = Math.min(50, parseInt(params.albumCount || '20', 10));
        const songCount = Math.min(100, parseInt(params.songCount || '50', 10));

        const [artists, albums, tracks] = await Promise.all([
          prisma.artist.findMany({
            where: { name: { contains: query } },
            take: artistCount,
            include: { _count: { select: { albums: true } } },
          }),
          prisma.album.findMany({
            where: { title: { contains: query }, tracks: { some: { isUnavailable: false } } },
            take: albumCount,
            include: {
              artist: true,
              _count: { select: { tracks: true } },
              tracks: { select: { duration: true, genre: true } },
            },
          }),
          prisma.track.findMany({
            where: {
              isUnavailable: false,
              OR: [
                { title: { contains: query } },
                { artistName: { contains: query } },
                { albumTitle: { contains: query } },
              ],
            },
            take: songCount,
            include: {
              album: true,
              artist: true,
              userStats: { where: { userId: user.id } },
            },
          }),
        ]);

        const formattedArtists = artists.map(a => ({
          id: a.id,
          name: a.name,
          coverArt: a.id,
          albumCount: a._count.albums,
        }));

        const formattedAlbums = albums.map(formatSubsonicAlbum);
        const formattedSongs = tracks.map(formatSubsonicSong);

        const responseKey = method === 'search3' ? 'searchResult3' : 'searchResult2';
        return sendSubsonicResponse(reply, format, {
          [responseKey]: {
            artist: formattedArtists,
            album: formattedAlbums,
            song: formattedSongs,
          },
        });
      }

      // 14. Audio Stream
      case 'stream': {
        const trackId = params.id;
        if (!trackId) {
          return sendSubsonicError(reply, format, 10, 'Required parameter missing: id');
        }

        (req as any).params = { trackId };

        if (params.format && params.format !== 'raw') {
          (req.query as any).transcode = 'true';
          (req.query as any).format = params.format;
        }
        if (params.maxBitRate) {
          (req.query as any).maxBitRate = params.maxBitRate;
        }
        if (params.timeOffset) {
          (req.query as any).timeOffset = params.timeOffset;
        }

        return handleStreamRequest(req as any, reply);
      }

      // 15. Cover Art
      case 'getcoverart': {
        const id = params.id;
        if (!id) {
          return sendSubsonicError(reply, format, 10, 'Required parameter missing: id');
        }

        let artworkId = id;
        const targetSize = parseInt(params.size || '300', 10);
        const parsedSize = targetSize <= 128 ? 96 : targetSize <= 350 ? 256 : 512;

        // Check if id is an Album or Track
        const album = await prisma.album.findUnique({
          where: { id },
          select: { artworkId: true },
        });

        if (album?.artworkId) {
          artworkId = album.artworkId;
        } else {
          const track = await prisma.track.findUnique({
            where: { id },
            select: { artworkId: true, album: { select: { artworkId: true } } },
          });
          if (track?.artworkId) {
            artworkId = track.artworkId;
          } else if (track?.album?.artworkId) {
            artworkId = track.album.artworkId;
          } else {
            const artist = await prisma.artist.findUnique({
              where: { id },
              include: { albums: { select: { artworkId: true }, take: 1 } },
            });
            if (artist?.albums?.[0]?.artworkId) {
              artworkId = artist.albums[0].artworkId;
            }
          }
        }

        const thumb = await getArtworkThumbnail(artworkId, parsedSize);
        if (!thumb) {
          reply.header('Content-Type', 'image/svg+xml');
          reply.header('Cache-Control', 'public, max-age=3600');
          return reply.send(FALLBACK_SVG);
        }

        reply.header('Content-Type', thumb.contentType);
        reply.header('Cache-Control', 'public, max-age=86400');
        return reply.send(thumb.buffer);
      }

      // 16. Scrobble & Now Playing
      case 'scrobble': {
        const trackId = params.id;
        if (!trackId) {
          return sendSubsonicError(reply, format, 10, 'Required parameter missing: id');
        }

        const isSubmission = params.submission !== 'false' && params.submission !== false;
        const clientName = params.c || 'Subsonic App';

        if (!isSubmission) {
          // Now Playing notification
          await startPlaybackSession(user.id, trackId, clientName);
          return sendSubsonicResponse(reply, format);
        }

        // Full Scrobble: increment local play count & trigger scrobble queue
        const track = await prisma.track.findUnique({
          where: { id: trackId },
        });

        if (track) {
          const session = await startPlaybackSession(user.id, trackId, clientName);
          const listenedSeconds = Math.max(30, Math.min(track.duration, 240));

          await reportPlaybackProgress({
            userId: user.id,
            trackId,
            sessionId: session.id,
            listenedSeconds,
            eventId: `subsonic_${Date.now()}_${trackId}`,
          });
        }

        return sendSubsonicResponse(reply, format);
      }

      // 16b. Now Playing (recent open playback sessions)
      case 'getnowplaying': {
        const cutoff = new Date(Date.now() - 60 * 60 * 1000);
        const sessions = await prisma.playbackSession.findMany({
          where: { endedAt: null, startedAt: { gte: cutoff } },
          include: {
            track: { include: { album: true } },
            user: { select: { username: true } },
          },
          orderBy: { startedAt: 'desc' },
          take: 50,
        });

        const entries = sessions.map((session) => ({
          ...formatSubsonicSong(session.track),
          username: session.user.username,
          minutesAgo: Math.max(0, Math.floor((Date.now() - session.startedAt.getTime()) / 60000)),
          playerId: 0,
        }));

        return sendSubsonicResponse(reply, format, {
          nowPlaying: { entry: entries },
        });
      }

      // 17. Playlists
      case 'getplaylists': {
        const playlists = await prisma.playlist.findMany({
          where: { userId: user.id },
          include: {
            _count: { select: { tracks: true } },
            tracks: {
              include: { track: { select: { duration: true } } },
            },
          },
          orderBy: { name: 'asc' },
        });

        const formattedPlaylists = playlists.map(p => {
          const duration = p.tracks.reduce((acc, pt) => acc + (pt.track?.duration || 0), 0);
          return {
            id: p.id,
            name: p.name,
            comment: p.description || undefined,
            owner: user.username,
            public: false,
            songCount: p._count.tracks,
            duration: Math.round(duration),
            created: p.createdAt.toISOString(),
            changed: p.updatedAt.toISOString(),
          };
        });

        return sendSubsonicResponse(reply, format, {
          playlists: {
            playlist: formattedPlaylists,
          },
        });
      }

      case 'getplaylist': {
        const playlistId = params.id;
        if (!playlistId) {
          return sendSubsonicError(reply, format, 10, 'Required parameter missing: id');
        }

        const playlist = await prisma.playlist.findFirst({
          where: { id: playlistId, userId: user.id },
          include: {
            tracks: {
              include: {
                track: {
                  include: {
                    album: true,
                    artist: true,
                    userStats: { where: { userId: user.id } },
                  },
                },
              },
              orderBy: { sortOrder: 'asc' },
            },
          },
        });

        if (!playlist) {
          return sendSubsonicError(reply, format, 70, 'Playlist not found');
        }

        const songs = playlist.tracks
          .filter(pt => pt.track)
          .map(pt => formatSubsonicSong(pt.track));

        const duration = songs.reduce((acc, s) => acc + (s.duration || 0), 0);

        return sendSubsonicResponse(reply, format, {
          playlist: {
            id: playlist.id,
            name: playlist.name,
            comment: playlist.description || undefined,
            owner: user.username,
            public: false,
            songCount: songs.length,
            duration: Math.round(duration),
            created: playlist.createdAt.toISOString(),
            changed: playlist.updatedAt.toISOString(),
            entry: songs,
          },
        });
      }

      // 18. Starred / Favorites
      case 'getstarred':
      case 'getstarred2': {
        const favoriteTracks = await prisma.track.findMany({
          where: {
            userStats: {
              some: {
                userId: user.id,
                isFavorite: true,
              },
            },
          },
          include: {
            album: true,
            artist: true,
            userStats: { where: { userId: user.id } },
          },
          orderBy: { title: 'asc' },
          take: 500,
        });

        const songs = favoriteTracks.map(formatSubsonicSong);
        const rootKey = method === 'getstarred2' ? 'starred2' : 'starred';
        return sendSubsonicResponse(reply, format, {
          [rootKey]: {
            song: songs,
            album: [],
            artist: [],
          },
        });
      }

      case 'star':
      case 'unstar': {
        const isStar = method === 'star';
        const rawIds = params.id;
        const trackIds: string[] = [];
        if (Array.isArray(rawIds)) {
          trackIds.push(...rawIds);
        } else if (typeof rawIds === 'string') {
          trackIds.push(rawIds);
        }

        for (const tId of trackIds) {
          await prisma.userTrackStats.upsert({
            where: {
              userId_trackId: {
                userId: user.id,
                trackId: tId,
              },
            },
            update: { isFavorite: isStar },
            create: {
              userId: user.id,
              trackId: tId,
              isFavorite: isStar,
            },
          });
        }

        return sendSubsonicResponse(reply, format);
      }

      case 'setrating': {
        const trackId = params.id;
        const rawRating = parseInt(params.rating, 10);
        if (!trackId || isNaN(rawRating)) {
          return sendSubsonicError(reply, format, 10, 'Required parameter missing: id or rating');
        }

        // Subsonic ratings are 1-5, or 0 to clear
        const ratingVal = rawRating > 0 ? Math.min(100, Math.max(0, rawRating * 20)) : null;

        await prisma.userTrackStats.upsert({
          where: {
            userId_trackId: {
              userId: user.id,
              trackId,
            },
          },
          update: { rating: ratingVal },
          create: {
            userId: user.id,
            trackId,
            rating: ratingVal,
          },
        });

        return sendSubsonicResponse(reply, format);
      }

      // 18b. Cross-device Play Queue
      case 'getplayqueue': {
        const setting = await prisma.setting.findUnique({ where: { key: playQueueKey(user.id) } });
        const queue = normalizePlayQueue(setting?.value);
        if (queue.ids.length === 0) {
          return sendSubsonicResponse(reply, format, { playQueue: {} });
        }

        const tracks = await prisma.track.findMany({
          where: { id: { in: queue.ids } },
          include: {
            album: true,
            userStats: { where: { userId: user.id } },
          },
        });

        return sendSubsonicResponse(
          reply,
          format,
          buildPlayQueuePayload(queue, tracks.map(formatSubsonicSong))
        );
      }

      case 'saveplayqueue': {
        const rawIds = params.id;
        const ids = (Array.isArray(rawIds) ? rawIds : rawIds ? [rawIds] : []).filter(
          (id): id is string => typeof id === 'string' && id.length > 0
        );
        if (ids.length === 0) {
          return sendSubsonicError(reply, format, 10, 'Required parameter missing: id');
        }

        const requestedCurrent = typeof params.current === 'string' ? params.current : null;
        const currentId = requestedCurrent && ids.includes(requestedCurrent) ? requestedCurrent : ids[0];
        const position = Math.max(0, parseInt(params.position, 10) || 0);
        const key = playQueueKey(user.id);
        const value = JSON.stringify({
          ids,
          currentId,
          position,
          changedBy: typeof params.c === 'string' && params.c ? params.c : user.username,
        });

        await prisma.setting.upsert({
          where: { key },
          update: { value },
          create: { key, value },
        });

        return sendSubsonicResponse(reply, format);
      }

      // 18c. Bookmarks (resume positions for audiobooks/podcasts)
      case 'getbookmarks': {
        const setting = await prisma.setting.findUnique({ where: { key: bookmarksKey(user.id) } });
        const bookmarks = normalizeBookmarks(setting?.value);
        if (bookmarks.length === 0) {
          return sendSubsonicResponse(reply, format, { bookmarks: {} });
        }

        const tracks = await prisma.track.findMany({
          where: { id: { in: bookmarks.map((b) => b.trackId) } },
          include: {
            album: true,
            userStats: { where: { userId: user.id } },
          },
        });
        const trackMap = new Map(tracks.map((track) => [track.id, track]));

        const entries = bookmarks
          .filter((bookmark) => trackMap.has(bookmark.trackId))
          .map((bookmark) => ({
            entry: formatSubsonicSong(trackMap.get(bookmark.trackId)),
            position: bookmark.position,
            username: user.username,
            comment: bookmark.comment || undefined,
            created: bookmark.created || undefined,
          }));

        return sendSubsonicResponse(reply, format, {
          bookmarks: { bookmark: entries },
        });
      }

      case 'createbookmark': {
        const trackId = params.id;
        const position = parseInt(params.position, 10);
        if (!trackId || !Number.isFinite(position) || position < 0) {
          return sendSubsonicError(reply, format, 10, 'Required parameter missing: id or position');
        }

        const key = bookmarksKey(user.id);
        const setting = await prisma.setting.findUnique({ where: { key } });
        const map: Record<string, any> = {};
        for (const bookmark of normalizeBookmarks(setting?.value)) {
          map[bookmark.trackId] = {
            position: bookmark.position,
            comment: bookmark.comment,
            created: bookmark.created,
          };
        }
        map[trackId] = {
          position,
          comment: typeof params.comment === 'string' && params.comment ? params.comment : null,
          created: new Date().toISOString(),
        };

        const value = JSON.stringify(map);
        await prisma.setting.upsert({
          where: { key },
          update: { value },
          create: { key, value },
        });

        return sendSubsonicResponse(reply, format);
      }

      case 'deletebookmark': {
        const trackId = params.id;
        if (!trackId) {
          return sendSubsonicError(reply, format, 10, 'Required parameter missing: id');
        }

        const key = bookmarksKey(user.id);
        const setting = await prisma.setting.findUnique({ where: { key } });
        const remaining = normalizeBookmarks(setting?.value).filter((bookmark) => bookmark.trackId !== trackId);

        if (remaining.length === 0) {
          await prisma.setting.deleteMany({ where: { key } });
        } else {
          const map: Record<string, any> = {};
          for (const bookmark of remaining) {
            map[bookmark.trackId] = {
              position: bookmark.position,
              comment: bookmark.comment,
              created: bookmark.created,
            };
          }
          await prisma.setting.update({ where: { key }, data: { value: JSON.stringify(map) } });
        }

        return sendSubsonicResponse(reply, format);
      }

      // 19. Lyrics
      case 'getlyrics': {
        const trackId = params.id;
        const artist = params.artist;
        const title = params.title;

        let track: any = null;
        if (trackId) {
          track = await prisma.track.findUnique({
            where: { id: trackId },
          });
        } else if (artist && title) {
          track = await prisma.track.findFirst({
            where: {
              artistName: { contains: String(artist) },
              title: { contains: String(title) },
            },
          });
        }

        if (!track) {
          return sendSubsonicResponse(reply, format, { lyrics: {} });
        }

        const lyricsResult = await lyricsService.getLyrics(track.id, false);
        return sendSubsonicResponse(reply, format, {
          lyrics: {
            artist: track.artistName,
            title: track.title,
            content: lyricsResult?.plainLyrics || '',
          },
        });
      }

      // 19b. OpenSubsonic Structured Lyrics
      case 'getlyricsbysongid': {
        const trackId = params.id;
        if (!trackId) {
          return sendSubsonicError(reply, format, 10, 'Required parameter missing: id');
        }

        const track = await prisma.track.findUnique({
          where: { id: trackId },
          select: { id: true, title: true, artistName: true },
        });
        if (!track) {
          return sendSubsonicError(reply, format, 70, 'Song not found');
        }

        const lyrics = await lyricsService.getLyrics(track.id, false);
        const lyricsList = buildStructuredLyrics({
          artist: track.artistName,
          title: track.title,
          lines: lyrics.lines,
          plainLyrics: lyrics.plainLyrics,
          hasSyncedLyrics: lyrics.hasSyncedLyrics,
        });

        return sendSubsonicResponse(reply, format, { lyricsList });
      }

      // 20. Top Songs
      case 'gettopsongs': {
        const artistName = params.artist;
        const count = Math.min(100, Math.max(1, parseInt(params.count, 10) || 50));

        const tracks = await prisma.track.findMany({
          where: artistName ? { artistName: { contains: String(artistName) } } : undefined,
          include: {
            album: true,
            artist: true,
            userStats: { where: { userId: user.id } },
          },
          orderBy: [
            { importedPlayCount: 'desc' },
            { title: 'asc' },
          ],
          take: count,
        });

        const songs = tracks.map(formatSubsonicSong);
        return sendSubsonicResponse(reply, format, {
          topSongs: {
            song: songs,
          },
        });
      }

      case 'createplaylist': {
        const playlistId = params.playlistId;
        const name = params.name;
        const rawSongIds = Array.isArray(params.songId)
          ? params.songId
          : params.songId
          ? [params.songId]
          : [];

        let playlist: any;
        if (playlistId) {
          const owned = await prisma.playlist.findFirst({
            where: { id: playlistId, userId: user.id },
            select: { id: true },
          });
          if (!owned) {
            return sendSubsonicError(reply, format, 70, 'Playlist not found');
          }

          playlist = await prisma.playlist.update({
            where: { id: playlistId },
            data: name ? { name } : {},
          });
          if (rawSongIds.length > 0) {
            const existingCount = await prisma.playlistTrack.count({ where: { playlistId } });
            await prisma.playlistTrack.createMany({
              data: rawSongIds.map((tid: string, idx: number) => ({
                playlistId,
                trackId: tid,
                sortOrder: existingCount + idx,
              })),
            });
          }
        } else {
          playlist = await prisma.playlist.create({
            data: {
              userId: user.id,
              name: name || 'New Playlist',
            },
          });
          if (rawSongIds.length > 0) {
            await prisma.playlistTrack.createMany({
              data: rawSongIds.map((tid: string, idx: number) => ({
                playlistId: playlist.id,
                trackId: tid,
                sortOrder: idx,
              })),
            });
          }
        }

        const fullPlaylist = await prisma.playlist.findUnique({
          where: { id: playlist.id },
          include: {
            tracks: {
              orderBy: { sortOrder: 'asc' },
              include: {
                track: {
                  include: {
                    album: true,
                    artist: true,
                    userStats: { where: { userId: user.id } },
                  },
                },
              },
            },
            user: { select: { username: true } },
          },
        });

        const songs = fullPlaylist?.tracks.filter((pt) => pt.track).map((pt) => formatSubsonicSong(pt.track)) || [];
        const duration = fullPlaylist?.tracks.reduce((sum, pt) => sum + (pt.track?.duration || 0), 0) || 0;

        return sendSubsonicResponse(reply, format, {
          playlist: {
            id: playlist.id,
            name: playlist.name,
            owner: user.username,
            public: true,
            songCount: songs.length,
            duration: Math.round(duration),
            created: playlist.createdAt.toISOString(),
            changed: playlist.updatedAt.toISOString(),
            entry: songs,
          },
        });
      }

      case 'updateplaylist': {
        const playlistId = params.playlistId;
        if (!playlistId) {
          return sendSubsonicError(reply, format, 10, 'Required parameter missing: playlistId');
        }

        const playlist = await prisma.playlist.findFirst({
          where: { id: playlistId, userId: user.id },
        });
        if (!playlist) {
          return sendSubsonicError(reply, format, 70, 'Playlist not found');
        }

        const updates: any = {};
        if (params.name) updates.name = params.name;
        if (params.comment !== undefined) updates.description = params.comment;
        if (Object.keys(updates).length > 0) {
          await prisma.playlist.update({
            where: { id: playlistId },
            data: updates,
          });
        }

        if (params.songIndexToRemove !== undefined) {
          const rawIndexes = Array.isArray(params.songIndexToRemove)
            ? params.songIndexToRemove
            : [params.songIndexToRemove];
          const removeIndices = new Set(rawIndexes.map((x: any) => parseInt(x, 10)));

          const currentTracks = await prisma.playlistTrack.findMany({
            where: { playlistId },
            orderBy: { sortOrder: 'asc' },
          });

          const toDeleteIds: string[] = [];
          currentTracks.forEach((t, idx) => {
            if (removeIndices.has(idx)) {
              toDeleteIds.push(t.id);
            }
          });

          if (toDeleteIds.length > 0) {
            await prisma.playlistTrack.deleteMany({
              where: { id: { in: toDeleteIds } },
            });
            const remaining = await prisma.playlistTrack.findMany({
              where: { playlistId },
              orderBy: { sortOrder: 'asc' },
            });
            for (let i = 0; i < remaining.length; i++) {
              if (remaining[i].sortOrder !== i) {
                await prisma.playlistTrack.update({
                  where: { id: remaining[i].id },
                  data: { sortOrder: i },
                });
              }
            }
          }
        }

        if (params.songIdToAdd !== undefined) {
          const rawAddIds = Array.isArray(params.songIdToAdd)
            ? params.songIdToAdd
            : [params.songIdToAdd];
          if (rawAddIds.length > 0) {
            const count = await prisma.playlistTrack.count({ where: { playlistId } });
            await prisma.playlistTrack.createMany({
              data: rawAddIds.map((tid: string, idx: number) => ({
                playlistId,
                trackId: tid,
                sortOrder: count + idx,
              })),
            });
          }
        }

        return sendSubsonicResponse(reply, format);
      }

      case 'deleteplaylist': {
        const playlistId = params.id;
        if (!playlistId) {
          return sendSubsonicError(reply, format, 10, 'Required parameter missing: id');
        }

        const owned = await prisma.playlist.findFirst({
          where: { id: playlistId, userId: user.id },
          select: { id: true },
        });
        if (!owned) {
          return sendSubsonicError(reply, format, 70, 'Playlist not found');
        }

        await prisma.playlistTrack.deleteMany({ where: { playlistId } });
        await prisma.playlist.delete({ where: { id: playlistId } });

        return sendSubsonicResponse(reply, format);
      }

      case 'jukeboxcontrol': {
        const action = (params.action || 'status').toLowerCase();
        const jukeboxStatus = {
          currentIndex: 0,
          playing: false,
          gain: typeof params.gain === 'string' ? parseFloat(params.gain) : 1.0,
          position: 0,
        };

        if (action === 'get') {
          return sendSubsonicResponse(reply, format, {
            jukeboxPlaylist: {
              ...jukeboxStatus,
              entry: [],
            },
          });
        }

        return sendSubsonicResponse(reply, format, {
          jukeboxStatus,
        });
      }

      // 21. Original File Download
      case 'download': {
        const trackId = params.id;
        if (!trackId) {
          return sendSubsonicError(reply, format, 10, 'Required parameter missing: id');
        }

        (req as any).params = { trackId };
        (req.query as any).download = 'true';
        return handleStreamRequest(req as any, reply);
      }

      // 22. Scan Control
      case 'getscanstatus': {
        const status = getScanStatus();
        const folderCount = await prisma.libraryRoot.count({ where: { isEnabled: true } });

        return sendSubsonicResponse(reply, format, {
          scanStatus: {
            scanning: status.isRunning,
            count: status.totalFilesFound,
            folderCount,
          },
        });
      }

      case 'startscan': {
        if (user.role !== 'admin') {
          return sendSubsonicError(reply, format, 50, 'Not authorized to start a library scan');
        }

        const status = getScanStatus();
        const folderCount = await prisma.libraryRoot.count({ where: { isEnabled: true } });

        if (!status.isRunning) {
          void runLibraryScan().catch((err) => {
            app.log.error({ err }, 'Subsonic-triggered scan failed');
          });
        }

        return sendSubsonicResponse(reply, format, {
          scanStatus: {
            scanning: true,
            count: status.totalFilesFound,
            folderCount,
          },
        });
      }

      // 23. User & Avatar
      case 'getuser': {
        const requestedName = typeof params.username === 'string' ? params.username : user.username;
        const target =
          requestedName === user.username
            ? { username: user.username, role: user.role }
            : await prisma.user.findUnique({
                where: { username: requestedName },
                select: { username: true, role: true },
              });

        if (!target) {
          return sendSubsonicError(reply, format, 70, 'User not found');
        }

        const folderCount = await prisma.libraryRoot.count({ where: { isEnabled: true } });
        return sendSubsonicResponse(reply, format, {
          user: {
            username: target.username,
            scrobblingEnabled: true,
            adminRole: target.role === 'admin',
            settingsRole: target.role === 'admin',
            downloadRole: true,
            uploadRole: false,
            playlistRole: true,
            coverArtRole: true,
            commentRole: false,
            podcastRole: false,
            shareRole: false,
            videoConversionRole: false,
            folder: Array.from({ length: folderCount }, (_, index) => index + 1),
          },
        });
      }

      case 'getavatar': {
        reply.header('Content-Type', 'image/svg+xml');
        reply.header('Cache-Control', 'public, max-age=86400');
        return reply.send(FALLBACK_SVG);
      }

      // 24. Unsupported media types return empty lists so clients do not error out.
      case 'getinternetradiostations':
        return sendSubsonicResponse(reply, format, { internetRadioStations: {} });
      case 'getpodcasts':
        return sendSubsonicResponse(reply, format, { podcasts: {} });
      case 'getnewestpodcasts':
        return sendSubsonicResponse(reply, format, { newestPodcasts: {} });
      case 'getshares':
        return sendSubsonicResponse(reply, format, { shares: {} });
      case 'getvideos':
        return sendSubsonicResponse(reply, format, { videos: {} });
      case 'getcaptions':
        return sendSubsonicResponse(reply, format, { captions: {} });
      case 'getchatmessages':
        return sendSubsonicResponse(reply, format, { chatMessages: {} });

      default: {
        return sendSubsonicError(reply, format, 0, `Subsonic method '${method}' is not implemented on this server`);
      }
    }
  });
}
