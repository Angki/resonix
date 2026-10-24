import * as mm from 'music-metadata';
import path from 'path';
import type { FolderLayout } from './folderLayout.js';

export interface ExtractedMetadata {
  title: string;
  artistName: string;
  albumArtist?: string;
  albumTitle: string;
  trackNumber?: number;
  discNumber?: number;
  duration: number;
  year?: number;
  genre?: string;
  composer?: string;
  comment?: string;
  codec?: string;
  bitrate?: number;
  sampleRate?: number;
  bitDepth?: number;
  channels?: number;
  isLossless: boolean;
  replayGainTrackGain?: number;
  replayGainAlbumGain?: number;
  replayGainTrackPeak?: number;
  picture?: {
    format: string;
    data: Buffer;
  };
}

function parseDbGain(value: any): number | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === 'number') return value;
  if (typeof value === 'object' && typeof value.dB === 'number') return value.dB;
  if (typeof value === 'string') {
    const parsed = parseFloat(value.replace(/[^\d.-]/g, ''));
    if (!Number.isNaN(parsed)) return parsed;
  }
  return undefined;
}

function parsePeakRatio(value: any): number | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === 'number') return value;
  if (typeof value === 'object' && typeof value.ratio === 'number') return value.ratio;
  if (typeof value === 'string') {
    const parsed = parseFloat(value);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return undefined;
}

export function parseReplayGain(common: Record<string, any>): {
  trackGain?: number;
  albumGain?: number;
  trackPeak?: number;
} {
  const result: { trackGain?: number; albumGain?: number; trackPeak?: number } = {};

  const trackGain = parseDbGain(common?.replaygain_track_gain);
  if (trackGain !== undefined) result.trackGain = trackGain;

  const albumGain = parseDbGain(common?.replaygain_album_gain);
  if (albumGain !== undefined) result.albumGain = albumGain;

  const trackPeak = parsePeakRatio(common?.replaygain_track_peak);
  if (trackPeak !== undefined) result.trackPeak = trackPeak;

  return result;
}

/**
 * Clean and normalize song titles from tags or raw filenames:
 * - Strips redundant nested audio extensions (".wav", ".m4a")
 * - Strips leading track numbers / vinyl side letters ("01. ", "A1. ", "B2 - ")
 * - Strips redundant "Artist - " prefixes when the title begins with the artist name
 */
export function cleanTitle(rawTitle: string | undefined, filename: string, artistName?: string): string {
  let title = rawTitle?.trim();
  const isFromFile = !title;
  if (!title) {
    title = path.parse(filename).name;
  }

  // 1. Strip nested or residual audio extensions (e.g. "Song.wav.mp3" -> "Song")
  const extRegex = /\.(mp3|m4a|flac|wav|ogg|opus|aac|alac|aiff|wma|wv|ape|dsf|dff|mka)$/i;
  while (extRegex.test(title)) {
    title = title.replace(extRegex, '').trim();
  }

  // 2. Strip leading track numbers & vinyl sides:
  // - Vinyl sides: "A1. ", "B2 - ", "C1 ", "D2. "
  // - Track numbers with delimiter (optional space before/after): "01. ", "01 - ", "01) ", "01_ ", "01 : "
  // - Track numbers with leading zero: "01 ", "09 "
  // We strictly avoid stripping bare non-zero numbers without delimiter (e.g. "15 traxxx", "2 MILLION TONS", "99 Problems")
  const stripPrefixNumbers = (str: string): string => {
    return str
      .replace(/^[A-Fa-f]\d{1,2}(?:\s*[\.\-_–—:]\s*|\s+)/, '')
      .replace(/^\d{1,3}\s*[\.\)\-_–—:]\s*/, '')
      .replace(/^0\d\s+/, '')
      .trim();
  };

  if (isFromFile || /^[A-Fa-f]\d{1,2}(?:\s*[\.\-_–—:]\s*|\s+)/.test(title) || /^\d{1,3}\s*[\.\)\-_–—:]\s*/.test(title) || /^0\d\s+/.test(title)) {
    title = stripPrefixNumbers(title);
  }

  // 3. Strip redundant "Artist - " prefix if title begins with the artist name
  if (artistName && artistName.trim().length > 1) {
    const art = artistName.trim().toLowerCase();
    const tLower = title.toLowerCase();
    if (tLower.startsWith(art + ' - ')) {
      title = title.slice(art.length + 3).trim();
    } else if (tLower.startsWith(art + ' -')) {
      title = title.slice(art.length + 2).trim();
    } else if (tLower.startsWith(art + ' : ')) {
      title = title.slice(art.length + 3).trim();
    } else if (tLower.startsWith(art + ' – ')) {
      title = title.slice(art.length + 3).trim();
    } else if (tLower.startsWith(art + ' — ')) {
      title = title.slice(art.length + 3).trim();
    }
  }

  // 4. If title has "Artist - Track" fallback pattern:
  // e.g. "ColdWorld - Scars" -> "Scars"
  const splitHyphen = title.split(' - ');
  if (splitHyphen.length === 2 && artistName) {
    if (splitHyphen[0].trim().toLowerCase() === artistName.trim().toLowerCase()) {
      title = splitHyphen[1].trim();
    }
  }

  // 5. Clean any residual track number after artist removal (e.g. "Artist - 01. Song" -> "01. Song" -> "Song")
  title = stripPrefixNumbers(title);

  return title || path.parse(filename).name;
}

export function cleanFallbackTitle(filename: string, artistName?: string): string {
  return cleanTitle(undefined, filename, artistName);
}

/**
 * Parse track number and disc number from filenames or vinyl notations:
 * - "A1. ColdWorld - Scars" -> { trackNumber: 1, discNumber: 1 } (Side A)
 * - "B2. ColdWorld - Autumn Shades" -> { trackNumber: 2, discNumber: 2 } (Side B)
 * - "C1. ColdWorld - The Wind" -> { trackNumber: 1, discNumber: 3 } (Side C)
 * - "D2. ColdWorld - Escape II" -> { trackNumber: 2, discNumber: 4 } (Side D)
 * - "1-01. Title" -> { trackNumber: 1, discNumber: 1 }
 * - "2-03. Title" -> { trackNumber: 3, discNumber: 2 }
 * - "03. Track Title" -> { trackNumber: 3 }
 */
export function parseVinylOrTrackNumber(filename: string): { trackNumber?: number; discNumber?: number } {
  const base = path.parse(filename).name;

  // 1. Multi-disc numeric pattern: "1-01 Title", "2-04. Title", "CD1-02 Title"
  const multiDiscMatch = base.match(/^(?:CD|DISC)?\s*([1-9])[-_](\d{1,3})(?:[\s.)_-]|$)/i);
  if (multiDiscMatch) {
    const d = parseInt(multiDiscMatch[1], 10);
    const t = parseInt(multiDiscMatch[2], 10);
    return {
      discNumber: d > 0 ? d : undefined,
      trackNumber: t > 0 ? t : undefined,
    };
  }

  // 2. Vinyl Side Pattern: "A1", "B2", "C1", "D2", "E1", "F2"
  const vinylMatch = base.match(/^([A-Fa-f])(\d{1,2})(?:[\s.)_-]|$)/);
  if (vinylMatch) {
    const sideLetter = vinylMatch[1].toUpperCase();
    const trackNum = parseInt(vinylMatch[2], 10);
    const discMap: Record<string, number> = { A: 1, B: 2, C: 3, D: 4, E: 5, F: 6 };
    const discNum = discMap[sideLetter] || (sideLetter.charCodeAt(0) - 64);
    return {
      trackNumber: trackNum > 0 ? trackNum : undefined,
      discNumber: discNum > 0 ? discNum : undefined,
    };
  }

  // 3. Standard Numeric Track Number: "01. ", "02 - ", "12 "
  const stdMatch = base.match(/^(\d{1,3})(?:[\s.)_-]|$)/);
  if (stdMatch) {
    const n = parseInt(stdMatch[1], 10);
    return { trackNumber: n > 0 ? n : undefined };
  }

  return {};
}

export function parseLeadingTrackNumber(filename: string): number | undefined {
  return parseVinylOrTrackNumber(filename).trackNumber;
}

export async function parseAudioMetadata(filePath: string, layout?: FolderLayout): Promise<ExtractedMetadata> {
  const filename = path.basename(filePath);
  // Folder-derived fallbacks (tags always win when present)
  const folderArtist = layout?.artistFolder || undefined;
  const folderAlbum = layout?.albumTitle || undefined;
  const folderYear = layout?.year || undefined;
  const folderDisc = layout?.discNumber || undefined;

  try {
    const meta = await mm.parseFile(filePath, { duration: true, skipCovers: false });
    const common = meta.common || {};
    const format = meta.format || {};

    // iTunes / M4A Native Tag fallback if common tags are sparse
    let nativeTitle: string | undefined = undefined;
    let nativeArtist: string | undefined = undefined;
    let nativeAlbum: string | undefined = undefined;
    let nativeTrack: number | undefined = undefined;

    if (meta.native) {
      for (const tagGroup of Object.values(meta.native)) {
        for (const tag of tagGroup) {
          const id = tag.id.toLowerCase();
          if ((id === '©nam' || id === 'title') && typeof tag.value === 'string') {
            nativeTitle = nativeTitle || tag.value.trim();
          } else if ((id === '©art' || id === 'artist') && typeof tag.value === 'string') {
            nativeArtist = nativeArtist || tag.value.trim();
          } else if ((id === '©alb' || id === 'album') && typeof tag.value === 'string') {
            nativeAlbum = nativeAlbum || tag.value.trim();
          } else if (id === 'trkn' && typeof tag.value === 'number') {
            nativeTrack = nativeTrack || tag.value;
          }
        }
      }
    }

    const rawArtist = common.artist?.trim() || common.albumartist?.trim() || nativeArtist || folderArtist || 'Unknown Artist';
    const artistName = rawArtist;
    const albumArtist = common.albumartist?.trim() || folderArtist || common.artist?.trim() || undefined;
    const albumTitle = common.album?.trim() || nativeAlbum || folderAlbum || 'Unknown Album';

    // Parse vinyl & standard track/disc from filename
    const filenameNumbers = parseVinylOrTrackNumber(filename);
    const trackNumber = common.track?.no || nativeTrack || filenameNumbers.trackNumber;
    const discNumber = common.disk?.no || folderDisc || filenameNumbers.discNumber;

    // Clean title with artist context to strip redundant "Artist - " or leading numbers
    const rawTitle = common.title?.trim() || nativeTitle;
    const title = cleanTitle(rawTitle, filename, artistName);

    const duration = format.duration || 0;
    const tagYear = common.year || (common.date ? parseInt(common.date.slice(0, 4), 10) : undefined) || undefined;
    const year = tagYear && !isNaN(tagYear) ? tagYear : folderYear;
    const genre = Array.isArray(common.genre) ? common.genre.join(', ') : common.genre || undefined;
    const composer = Array.isArray(common.composer) ? common.composer.join(', ') : common.composer || undefined;
    const comment = Array.isArray(common.comment)
      ? common.comment.map((c: any) => (typeof c === 'string' ? c : c?.text ?? '')).filter(Boolean).join('; ') || undefined
      : (common.comment as any) || undefined;

    const fileExt = path.extname(filePath).replace('.', '').toLowerCase();
    const codec = format.codec || fileExt.toUpperCase();
    const bitrate = format.bitrate ? Math.round(format.bitrate / 1000) : undefined;
    const sampleRate = format.sampleRate || undefined;
    const bitDepth = format.bitsPerSample || undefined;
    const channels = format.numberOfChannels || undefined;

    const losslessExtensions = ['flac', 'wav', 'alac', 'aiff', 'wv', 'ape', 'dsf', 'dff'];
    const isLossless =
      format.lossless ??
      (['flac', 'wav', 'alac', 'aiff', 'wavpack', 'monkeys audio', 'dsd'].includes((format.codec || '').toLowerCase()) ||
        losslessExtensions.includes(fileExt));

    const {
      trackGain: replayGainTrackGain,
      albumGain: replayGainAlbumGain,
      trackPeak: replayGainTrackPeak,
    } = parseReplayGain(common as Record<string, any>);

    let picture: { format: string; data: Buffer } | undefined = undefined;
    if (common.picture && common.picture.length > 0) {
      const pic = common.picture[0];
      picture = {
        format: pic.format,
        data: Buffer.from(pic.data),
      };
    }

    return {
      title,
      artistName,
      albumArtist,
      albumTitle,
      trackNumber,
      discNumber,
      duration,
      year,
      genre,
      composer,
      comment,
      codec,
      bitrate,
      sampleRate,
      bitDepth,
      channels,
      isLossless: !!isLossless,
      replayGainTrackGain,
      replayGainAlbumGain,
      replayGainTrackPeak,
      picture,
    };
  } catch {
    // If music-metadata fails (e.g. slight header corruption), fallback to filename and folder layout
    const artist = folderArtist || 'Unknown Artist';
    const title = cleanFallbackTitle(filename, artist);
    const ext = path.extname(filePath).replace('.', '').toUpperCase();
    const isLossless = ['FLAC', 'WAV', 'ALAC', 'AIFF', 'WV', 'APE', 'DSF', 'DFF'].includes(ext);
    const parsedNums = parseVinylOrTrackNumber(filename);

    return {
      title,
      artistName: artist,
      albumArtist: folderArtist,
      albumTitle: folderAlbum || 'Unknown Album',
      trackNumber: parsedNums.trackNumber,
      discNumber: folderDisc || parsedNums.discNumber,
      year: folderYear,
      duration: 0,
      codec: ext,
      isLossless,
    };
  }
}
