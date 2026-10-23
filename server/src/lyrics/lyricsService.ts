import fs from 'fs';
import path from 'path';
import { parseFile } from 'music-metadata';
import { prisma } from '../db.js';
import { config } from '../config.js';

export interface LyricsLine {
  time: number;
  text: string;
}

export interface LyricsResponse {
  source: 'sidecar' | 'embedded' | 'cached' | 'online' | 'none';
  hasSyncedLyrics: boolean;
  lines: LyricsLine[];
  plainLyrics: string;
  isInstrumental?: boolean;
}

export function parseLrc(raw: string): { hasSynced: boolean; lines: LyricsLine[]; plainLyrics: string } {
  const lines: LyricsLine[] = [];
  const rawLines = raw.split(/\r?\n/);
  const timeRegex = /\[(\d{2,}):(\d{2})(?:\.(\d{2,3}))?\]/g;
  let hasSynced = false;
  const plainTextLines: string[] = [];

  for (const rawLine of rawLines) {
    const trimmed = rawLine.trim();
    if (!trimmed) continue;

    const matches = Array.from(trimmed.matchAll(timeRegex));
    if (matches.length > 0) {
      hasSynced = true;
      const text = trimmed.replace(timeRegex, '').trim();
      plainTextLines.push(text);
      for (const m of matches) {
        const mins = parseInt(m[1], 10);
        const secs = parseInt(m[2], 10);
        const msStr = m[3] || '0';
        const ms = parseFloat('0.' + msStr);
        const totalSecs = mins * 60 + secs + ms;
        lines.push({ time: Math.round(totalSecs * 100) / 100, text });
      }
    } else {
      if (!trimmed.match(/^\[[a-zA-Z]+:/)) {
        plainTextLines.push(trimmed);
      }
    }
  }

  lines.sort((a, b) => a.time - b.time);
  return {
    hasSynced,
    lines,
    plainLyrics: plainTextLines.join('\n').trim(),
  };
}

class LyricsService {
  private getCachePath(trackId: string): string {
    return path.join(config.lyricsDir, `${trackId}.lrc`);
  }

  /**
   * 1. Check local disk cache (server/data/lyrics/${trackId}.lrc)
   */
  private checkCache(trackId: string): LyricsResponse | null {
    const cacheFile = this.getCachePath(trackId);
    if (fs.existsSync(cacheFile)) {
      try {
        const content = fs.readFileSync(cacheFile, 'utf8');
        const parsed = parseLrc(content);
        return {
          source: 'cached',
          hasSyncedLyrics: parsed.hasSynced,
          lines: parsed.lines,
          plainLyrics: parsed.plainLyrics || content,
        };
      } catch (err) {
        console.warn(`Failed reading lyrics cache for track ${trackId}:`, err);
      }
    }
    return null;
  }

  /**
   * 2. Check local sidecar files in the track's folder (.lrc / .txt)
   */
  private checkSidecar(fullPath: string): LyricsResponse | null {
    try {
      const dir = path.dirname(fullPath);
      const ext = path.extname(fullPath);
      const base = path.basename(fullPath, ext);

      const candidates = [
        path.join(dir, `${base}.lrc`),
        path.join(dir, `${base}.LRC`),
        path.join(dir, `${path.basename(fullPath)}.lrc`),
        path.join(dir, `${base}.txt`),
      ];

      for (const file of candidates) {
        if (fs.existsSync(file)) {
          const content = fs.readFileSync(file, 'utf8');
          const parsed = parseLrc(content);
          return {
            source: 'sidecar',
            hasSyncedLyrics: parsed.hasSynced,
            lines: parsed.lines,
            plainLyrics: parsed.plainLyrics || content,
            rawContent: content,
          } as LyricsResponse & { rawContent?: string };
        }
      }
    } catch (err) {
      console.warn(`Sidecar search error for ${fullPath}:`, err);
    }
    return null;
  }

  /**
   * 3. Check embedded tags inside audio file
   */
  private async checkEmbedded(fullPath: string): Promise<LyricsResponse | null> {
    try {
      const meta = await parseFile(fullPath, { skipCovers: true });
      const lyricsArray = meta.common.lyrics;
      if (lyricsArray && lyricsArray.length > 0) {
        const text = typeof lyricsArray[0] === 'string' ? lyricsArray.join('\n') : (lyricsArray[0] as any)?.text;
        if (text && typeof text === 'string' && text.trim().length > 0) {
          const parsed = parseLrc(text);
          return {
            source: 'embedded',
            hasSyncedLyrics: parsed.hasSynced,
            lines: parsed.lines,
            plainLyrics: parsed.plainLyrics || text,
            rawContent: text,
          } as LyricsResponse & { rawContent?: string };
        }
      }
    } catch {
      // ignore metadata parse error
    }
    return null;
  }

  /**
   * 4. Query online LRCLIB API with disk cache
   */
  private async fetchOnline(
    artistName: string,
    trackTitle: string,
    albumTitle: string,
    duration: number,
    trackId: string
  ): Promise<LyricsResponse | null> {
    try {
      // Clean artist and track title (remove feat, remaster, etc)
      const cleanTitle = trackTitle.replace(/\s*\([^)]*\)/g, '').replace(/\s*\[[^\]]*\]/g, '').trim();
      const cleanArtist = artistName.replace(/\s*,\s*.*$/, '').trim();

      const q = new URLSearchParams({
        artist_name: cleanArtist,
        track_name: cleanTitle,
      });
      if (albumTitle && albumTitle !== 'Unknown Album') {
        q.set('album_name', albumTitle);
      }
      if (duration > 0) {
        q.set('duration', String(Math.round(duration)));
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 6000);

      const url = `https://lrclib.net/api/get?${q.toString()}`;
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'ResonixAudioPlayer/1.0 (+https://github.com/Angki/resonix)',
        },
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (res.ok) {
        const data = (await res.json()) as any;
        const syncedLyrics = data.syncedLyrics as string | undefined;
        const plainLyrics = data.plainLyrics as string | undefined;
        const instrumental = Boolean(data.instrumental);

        if (instrumental) {
          return {
            source: 'online',
            hasSyncedLyrics: false,
            lines: [],
            plainLyrics: '♪ Instrumental ♪',
            isInstrumental: true,
          };
        }

        if (syncedLyrics || plainLyrics) {
          const rawContent = syncedLyrics || plainLyrics || '';
          // Save to local disk cache
          try {
            fs.writeFileSync(this.getCachePath(trackId), rawContent, 'utf8');
          } catch (writeErr) {
            console.warn('Failed writing online lyrics to cache:', writeErr);
          }

          const parsed = parseLrc(rawContent);
          return {
            source: 'online',
            hasSyncedLyrics: parsed.hasSynced,
            lines: parsed.lines,
            plainLyrics: parsed.plainLyrics || plainLyrics || '',
          };
        }
      }

      // Fallback search if exact get failed
      const searchUrl = `https://lrclib.net/api/search?q=${encodeURIComponent(`${cleanArtist} ${cleanTitle}`)}`;
      const searchRes = await fetch(searchUrl, {
        headers: { 'User-Agent': 'BlackLibraryMusic/1.0' },
      });
      if (searchRes.ok) {
        const results = await searchRes.json();
        if (Array.isArray(results) && results.length > 0) {
          const best = results[0];
          const rawContent = best.syncedLyrics || best.plainLyrics || '';
          if (rawContent) {
            fs.writeFileSync(this.getCachePath(trackId), rawContent, 'utf8');
            const parsed = parseLrc(rawContent);
            return {
              source: 'online',
              hasSyncedLyrics: parsed.hasSynced,
              lines: parsed.lines,
              plainLyrics: parsed.plainLyrics || best.plainLyrics || '',
            };
          }
        }
      }
    } catch (err) {
      console.warn('Online lyrics search error:', err);
    }
    return null;
  }

  /**
   * Main resolution method: cascade Cache -> Sidecar -> Embedded -> Online
   */
  async getLyrics(trackId: string, forceOnline = false): Promise<LyricsResponse> {
    const track = await prisma.track.findUnique({
      where: { id: trackId },
    });

    if (!track) {
      return {
        source: 'none',
        hasSyncedLyrics: false,
        lines: [],
        plainLyrics: 'Lagu tidak ditemukan.',
      };
    }

    // 1. Cached file (unless forceOnline)
    if (!forceOnline) {
      const cached = this.checkCache(trackId);
      if (cached) return cached;
    }

    // 2. Local sidecar file
    const sidecar = this.checkSidecar(track.fullPath);
    if (sidecar) {
      // Save to cache for uniform fast access
      try {
        fs.writeFileSync(this.getCachePath(trackId), (sidecar as any).rawContent || sidecar.plainLyrics || '', 'utf8');
      } catch {}
      return sidecar;
    }

    // 3. Embedded tags
    const embedded = await this.checkEmbedded(track.fullPath);
    if (embedded) {
      try {
        fs.writeFileSync(this.getCachePath(trackId), (embedded as any).rawContent || embedded.plainLyrics || '', 'utf8');
      } catch {}
      return embedded;
    }

    // 4. Online lookup
    const online = await this.fetchOnline(
      track.artistName,
      track.title,
      track.albumTitle,
      track.duration,
      trackId
    );
    if (online) {
      return online;
    }

    return {
      source: 'none',
      hasSyncedLyrics: false,
      lines: [],
      plainLyrics: 'Lirik tidak ditemukan untuk lagu ini.',
    };
  }
}

export const lyricsService = new LyricsService();
