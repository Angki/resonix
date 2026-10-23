import fs from 'fs';
import path from 'path';
import pLimit from 'p-limit';
import sharp from 'sharp';
import { config } from '../config.js';
import { prisma } from '../db.js';

export interface BrokenArtwork {
  albumId: string;
  albumTitle: string;
  year: number | null;
  artistId: string | null;
  artistName: string | null;
  artworkId: string;
  source: string;
  mimeType: string;
  path: string | null;
  reason: 'missing-file' | 'empty-file' | 'unreadable';
}

export interface ArtworkIntegrityResult {
  total: number;
  checked: number;
  limit: number;
  offset: number;
  limited: boolean;
  brokenCount: number;
  broken: BrokenArtwork[];
  mutated: false;
}

const MAX_BROKEN = 500;

function clampLimit(value: number | undefined, fallback: number, max: number): number {
  if (!Number.isFinite(value) || value === undefined) return fallback;
  return Math.min(max, Math.max(1, Math.floor(value)));
}

function clampOffset(value: number | undefined): number {
  if (!Number.isFinite(value) || value === undefined) return 0;
  return Math.max(0, Math.floor(value));
}

async function resolveArtworkSource(
  hash: string,
  filePath: string | null
): Promise<{ sourcePath: string | null; reason: BrokenArtwork['reason'] | null }> {
  const masterPath = path.join(config.artworkCacheDir, `${hash}_master.bin`);
  const candidates = [masterPath, filePath].filter((candidate): candidate is string => Boolean(candidate));

  let emptyPath: string | null = null;
  for (const candidate of candidates) {
    try {
      const stat = await fs.promises.stat(candidate);
      if (!stat.isFile()) continue;
      if (stat.size <= 0) {
        emptyPath = emptyPath || candidate;
        continue;
      }
      return { sourcePath: candidate, reason: null };
    } catch {
      continue;
    }
  }

  if (emptyPath) return { sourcePath: emptyPath, reason: 'empty-file' };
  return { sourcePath: null, reason: 'missing-file' };
}

/** Read-only check that every album artwork record resolves to a usable image. */
export async function verifyArtworkIntegrity(
  options: { limit?: number; offset?: number } = {}
): Promise<ArtworkIntegrityResult> {
  const limit = clampLimit(options.limit, 250, 500);
  const offset = clampOffset(options.offset);

  const [countRows, rows] = await Promise.all([
    prisma.$queryRawUnsafe<any[]>(
      `
      SELECT COUNT(*) AS cnt
      FROM Album a
      WHERE a.artworkId IS NOT NULL
        AND EXISTS (SELECT 1 FROM Track t WHERE t.albumId = a.id AND t.isUnavailable = 0)
      `
    ),
    prisma.$queryRawUnsafe<any[]>(
      `
      SELECT
        a.id AS albumId,
        a.title AS albumTitle,
        a.year,
        a.artistId,
        art.name AS artistName,
        a.artworkId,
        aw.hash,
        aw.source,
        aw.mimeType,
        aw.filePath
      FROM Album a
      JOIN Artwork aw ON aw.id = a.artworkId
      LEFT JOIN Artist art ON art.id = a.artistId
      WHERE a.artworkId IS NOT NULL
        AND EXISTS (SELECT 1 FROM Track t WHERE t.albumId = a.id AND t.isUnavailable = 0)
      ORDER BY a.id ASC
      LIMIT ? OFFSET ?
      `,
      limit,
      offset
    ),
  ]);

  const gate = pLimit(8);
  let brokenCount = 0;
  const broken: BrokenArtwork[] = [];

  await Promise.all(
    rows.map((row) =>
      gate(async () => {
        const resolved = await resolveArtworkSource(String(row.hash), row.filePath || null);
        let reason = resolved.reason;
        if (resolved.sourcePath && !reason) {
          try {
            await sharp(resolved.sourcePath, { failOn: 'none' }).metadata();
          } catch {
            reason = 'unreadable';
          }
        }
        if (!reason) return;

        brokenCount += 1;
        if (broken.length < MAX_BROKEN) {
          broken.push({
            albumId: row.albumId,
            albumTitle: row.albumTitle,
            year: row.year ?? null,
            artistId: row.artistId ?? null,
            artistName: row.artistName ?? null,
            artworkId: row.artworkId,
            source: row.source,
            mimeType: row.mimeType,
            path: resolved.sourcePath,
            reason,
          });
        }
      })
    )
  );

  broken.sort((a, b) => String(a.artistName || '').localeCompare(String(b.artistName || '')));

  return {
    total: Number(countRows[0]?.cnt || 0),
    checked: rows.length,
    limit,
    offset,
    limited: rows.length >= limit,
    brokenCount,
    broken,
    mutated: false,
  };
}
