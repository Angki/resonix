import fs from 'fs';
import path from 'path';
import { prisma } from '../db.js';
import { normalizePath, SUPPORTED_AUDIO_EXTENSIONS } from '../library/paths.js';

export interface MusicBeeCandidate {
  category: 'library' | 'playlist' | 'smart_playlist' | 'settings' | 'artwork';
  folder: string;
  name: string;
  fullPath: string;
  sizeBytes: number;
  modifiedAt: Date;
}

export function discoverMusicBeeCandidates(baseDir: string): MusicBeeCandidate[] {
  const results: MusicBeeCandidate[] = [];
  if (!fs.existsSync(baseDir)) return results;

  try {
    const subdirs = fs.readdirSync(baseDir, { withFileTypes: true });

    for (const sub of subdirs) {
      if (!sub.isDirectory()) continue;
      const subPath = path.join(baseDir, sub.name);

      // Check for .mbl files
      const mblPath = path.join(subPath, 'MusicBeeLibrary.mbl');
      if (fs.existsSync(mblPath)) {
        const stat = fs.statSync(mblPath);
        results.push({
          category: 'library',
          folder: sub.name,
          name: 'MusicBeeLibrary.mbl',
          fullPath: mblPath,
          sizeBytes: stat.size,
          modifiedAt: stat.mtime,
        });
      }

      // Check settings .ini (XML)
      const iniPath = path.join(subPath, 'MusicBeeLibrarySettings.ini');
      if (fs.existsSync(iniPath)) {
        const stat = fs.statSync(iniPath);
        results.push({
          category: 'settings',
          folder: sub.name,
          name: 'MusicBeeLibrarySettings.ini',
          fullPath: iniPath,
          sizeBytes: stat.size,
          modifiedAt: stat.mtime,
        });
      }

      // Check playlists
      const plDir = path.join(subPath, 'Playlists');
      if (fs.existsSync(plDir)) {
        try {
          const plFiles = fs.readdirSync(plDir, { withFileTypes: true });
          for (const pl of plFiles) {
            if (!pl.isFile()) continue;
            const fullPl = path.join(plDir, pl.name);
            const stat = fs.statSync(fullPl);
            const ext = path.extname(pl.name).toLowerCase();
            if (ext === '.mbp') {
              results.push({
                category: 'playlist',
                folder: sub.name,
                name: pl.name,
                fullPath: fullPl,
                sizeBytes: stat.size,
                modifiedAt: stat.mtime,
              });
            } else if (ext === '.xautopf') {
              results.push({
                category: 'smart_playlist',
                folder: sub.name,
                name: pl.name,
                fullPath: fullPl,
                sizeBytes: stat.size,
                modifiedAt: stat.mtime,
              });
            }
          }
        } catch {
          // ignore
        }
      }
    }
  } catch (e) {
    console.error('Error discovering MusicBee candidates:', e);
  }

  return results;
}

export function parseMusicBeePlaylistMbp(filePath: string): string[] {
  if (!fs.existsSync(filePath)) return [];
  try {
    const buf = fs.readFileSync(filePath);
    const content = buf.toString('latin1');

    // Extract paths matching drive letters and audio extensions
    // e.g. D:\Music\...\track.mp3 or C:\Music\...
    const regex = /([a-zA-Z]:\\[^<>"|?*\x00-\x1F]+?\.(?:mp3|flac|m4a|aac|wav|ogg|opus|aiff|wma))/gi;
    const matches = content.match(regex);
    if (!matches) return [];

    return Array.from(new Set(matches.map(m => normalizePath(m.trim()))));
  } catch (e) {
    console.error('Failed to parse .mbp playlist:', e);
    return [];
  }
}

export function parseMusicBeeSmartPlaylist(filePath: string): { name: string; conditions: any[]; limit?: number } {
  const baseName = path.parse(filePath).name;
  if (!fs.existsSync(filePath)) return { name: baseName, conditions: [] };

  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    // Extract conditions and limits via regex to avoid fragile XML DOM dependencies
    const conditions: any[] = [];
    const conditionMatches = content.matchAll(/<Condition\s+Field="([^"]+)"\s+Comparison="([^"]+)"\s+(?:Value="([^"]*)")?/g);
    for (const match of conditionMatches) {
      conditions.push({
        field: match[1],
        comparison: match[2],
        value: match[3] || '',
      });
    }

    const limitMatch = content.match(/<Limit\s+Enabled="True"\s+Count="(\d+)"/i);
    const limit = limitMatch ? parseInt(limitMatch[1], 10) : undefined;

    return {
      name: baseName,
      conditions,
      limit,
    };
  } catch {
    return { name: baseName, conditions: [] };
  }
}

export async function previewMusicBeePlaylistImport(playlistPath: string) {
  const paths = parseMusicBeePlaylistMbp(playlistPath);
  const total = paths.length;

  const matchedTracks: Array<{ originalPath: string; trackId: string; title: string; artist: string; confidence: number }> = [];
  const unmatched: string[] = [];

  for (const rawPath of paths) {
    const norm = normalizePath(rawPath);
    const track = await prisma.track.findFirst({
      where: { fullPath: norm },
      select: { id: true, title: true, artistName: true, fullPath: true },
    });

    if (track) {
      matchedTracks.push({
        originalPath: rawPath,
        trackId: track.id,
        title: track.title,
        artist: track.artistName,
        confidence: 1.0,
      });
    } else {
      // Try fallback match by filename
      const filename = path.basename(rawPath);
      const fallbackTrack = await prisma.track.findFirst({
        where: { filename },
        select: { id: true, title: true, artistName: true, fullPath: true },
      });

      if (fallbackTrack) {
        matchedTracks.push({
          originalPath: rawPath,
          trackId: fallbackTrack.id,
          title: fallbackTrack.title,
          artist: fallbackTrack.artistName,
          confidence: 0.85,
        });
      } else {
        unmatched.push(rawPath);
      }
    }
  }

  return {
    playlistName: path.parse(playlistPath).name,
    total,
    matchedCount: matchedTracks.length,
    unmatchedCount: unmatched.length,
    matchedTracks,
    unmatchedSample: unmatched.slice(0, 20),
  };
}

export async function executeMusicBeePlaylistImport(userId: string, playlistPath: string) {
  const preview = await previewMusicBeePlaylistImport(playlistPath);

  const playlist = await prisma.playlist.create({
    data: {
      userId,
      name: preview.playlistName,
      description: `Imported from external playlist: ${path.basename(playlistPath)}`,
      isSmart: false,
    },
  });

  let sortOrder = 0;
  for (const item of preview.matchedTracks) {
    await prisma.playlistTrack.create({
      data: {
        playlistId: playlist.id,
        trackId: item.trackId,
        sortOrder: sortOrder++,
      },
    });
  }

  await prisma.musicBeeImport.create({
    data: {
      libraryPath: path.dirname(playlistPath),
      sourceFile: path.basename(playlistPath),
      tracksProcessed: preview.total,
      tracksMatched: preview.matchedCount,
      playlistsImported: 1,
      status: 'success',
      log: `Successfully imported ${preview.matchedCount} of ${preview.total} tracks into playlist "${playlist.name}"`,
    },
  });

  return {
    playlistId: playlist.id,
    playlistName: playlist.name,
    tracksImported: preview.matchedCount,
    unmatchedCount: preview.unmatchedCount,
  };
}
