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
  picture?: {
    format: string;
    data: Buffer;
  };
}

export function cleanFallbackTitle(filename: string): string {
  const base = path.parse(filename).name;
  // Strip common track numbers like "01. ", "01 - ", "01 "
  const cleaned = base.replace(/^\d+[\s.-]+/, '').trim();
  return cleaned || base;
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

    const title = common.title?.trim() || cleanFallbackTitle(filename);
    const artistName = common.artist?.trim() || common.albumartist?.trim() || folderArtist || 'Unknown Artist';
    const albumArtist = common.albumartist?.trim() || folderArtist || common.artist?.trim() || undefined;
    const albumTitle = common.album?.trim() || folderAlbum || 'Unknown Album';
    const trackNumber = common.track?.no || parseLeadingTrackNumber(filename);
    const discNumber = common.disk?.no || folderDisc;
    const duration = format.duration || 0;
    const tagYear = common.year || (common.date ? parseInt(common.date.slice(0, 4), 10) : undefined) || undefined;
    const year = tagYear && !isNaN(tagYear) ? tagYear : folderYear;
    const genre = Array.isArray(common.genre) ? common.genre.join(', ') : common.genre || undefined;
    const composer = Array.isArray(common.composer) ? common.composer.join(', ') : common.composer || undefined;
    const comment = Array.isArray(common.comment)
      ? common.comment.map((c: any) => (typeof c === 'string' ? c : c?.text ?? '')).filter(Boolean).join('; ') || undefined
      : (common.comment as any) || undefined;

    const codec = format.codec || path.extname(filePath).replace('.', '').toUpperCase();
    const bitrate = format.bitrate ? Math.round(format.bitrate / 1000) : undefined;
    const sampleRate = format.sampleRate || undefined;
    const bitDepth = format.bitsPerSample || undefined;
    const channels = format.numberOfChannels || undefined;
    const isLossless = format.lossless ?? (['flac', 'wav', 'alac', 'aiff'].includes((format.codec || '').toLowerCase()));

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
      picture,
    };
  } catch {
    // If music-metadata fails (e.g. slight header corruption), fallback to filename and folder layout
    const title = cleanFallbackTitle(filename);
    const ext = path.extname(filePath).replace('.', '').toUpperCase();
    const isLossless = ['FLAC', 'WAV', 'ALAC', 'AIFF'].includes(ext);

    return {
      title,
      artistName: folderArtist || 'Unknown Artist',
      albumArtist: folderArtist,
      albumTitle: folderAlbum || 'Unknown Album',
      trackNumber: parseLeadingTrackNumber(filename),
      discNumber: folderDisc,
      year: folderYear,
      duration: 0,
      codec: ext,
      isLossless,
    };
  }
}

/** "01. Title.mp3" / "A3. Title.mp3" / "12 - Title.flac" -> 1 / 3 / 12 */
export function parseLeadingTrackNumber(filename: string): number | undefined {
  const m = path.parse(filename).name.match(/^(?:[A-Da-d])?(\d{1,3})(?:[\s.)_-]|$)/);
  if (!m) return undefined;
  const n = parseInt(m[1], 10);
  return n > 0 ? n : undefined;
}
