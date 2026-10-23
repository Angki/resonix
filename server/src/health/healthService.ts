import crypto from 'crypto';
import fs from 'fs';
import pLimit from 'p-limit';
import { prisma } from '../db.js';
import { getScanStatus } from '../library/scanner.js';

export const HEALTH_ISSUE_TYPES = [
  'roots',
  'unavailable',
  'missing-artwork',
  'duplicates',
  'split-albums',
  'duplicate-artists',
  'metadata-gaps',
  'suspicious-audio',
] as const;

export type HealthIssueType = (typeof HEALTH_ISSUE_TYPES)[number];

export const HEALTH_ISSUE_META: Record<
  HealthIssueType,
  { label: string; description: string; severity: 'critical' | 'warning' | 'info'; ignorable: boolean }
> = {
  roots: {
    label: 'Library Roots',
    description: 'Configured collection folders that are missing or unreachable on disk',
    severity: 'critical',
    ignorable: false,
  },
  unavailable: {
    label: 'Unavailable Tracks',
    description: 'Tracks currently marked unavailable by the scanner',
    severity: 'critical',
    ignorable: false,
  },
  'missing-artwork': {
    label: 'Missing Artwork',
    description: 'Albums without any cover artwork',
    severity: 'warning',
    ignorable: true,
  },
  duplicates: {
    label: 'Duplicate Tracks',
    description: 'Same title, artist and rounded duration stored in multiple files',
    severity: 'warning',
    ignorable: true,
  },
  'split-albums': {
    label: 'Split Albums',
    description: 'The same album identity spread across multiple album folders',
    severity: 'warning',
    ignorable: true,
  },
  'duplicate-artists': {
    label: 'Artist Name Variants',
    description: 'Artists that only differ by case or surrounding whitespace',
    severity: 'warning',
    ignorable: true,
  },
  'metadata-gaps': {
    label: 'Metadata Gaps',
    description: 'Tracks missing genre, release year or track number tags',
    severity: 'info',
    ignorable: true,
  },
  'suspicious-audio': {
    label: 'Suspicious Audio',
    description: 'Files reporting zero duration, missing technical properties or suspiciously small size',
    severity: 'warning',
    ignorable: true,
  },
};

const IGNORED_SETTING_KEY = 'healthIgnoredIssues';
const IGNORED_CACHE_MS = 5000;
const MAX_IGNORED_IDS_PER_QUERY = 500;

export interface IgnoredHealthIssue {
  type: HealthIssueType;
  signature: string;
  label?: string;
  ignoredAt: string;
}

export interface HealthIssueQueryOptions {
  limit?: number;
  offset?: number;
}

export function isHealthIssueType(value: string): value is HealthIssueType {
  return (HEALTH_ISSUE_TYPES as readonly string[]).includes(value);
}

export function isIgnorableIssueType(value: HealthIssueType): boolean {
  return HEALTH_ISSUE_META[value].ignorable;
}

export function issueSignature(namespace: string, parts: Array<string | number | null | undefined>): string {
  const payload = [namespace, ...parts.map((part) => (part === null || part === undefined ? '' : String(part)))].join('\u0001');
  return crypto.createHash('sha1').update(payload).digest('hex').slice(0, 20);
}

export function trackMissingFields(track: {
  genre?: string | null;
  year?: number | null;
  trackNumber?: number | null;
}): string[] {
  const missing: string[] = [];
  if (!track.genre || !track.genre.trim()) missing.push('genre');
  if (track.year === null || track.year === undefined) missing.push('year');
  if (track.trackNumber === null || track.trackNumber === undefined) missing.push('trackNumber');
  return missing;
}

export function suspiciousAudioReasons(track: {
  duration?: number | null;
  bitrate?: number | null;
  sampleRate?: number | null;
  fileSize?: number | bigint | null;
}): string[] {
  const reasons: string[] = [];
  const duration = Number(track.duration ?? 0);
  const bitrate = track.bitrate === null || track.bitrate === undefined ? null : Number(track.bitrate);
  const sampleRate = track.sampleRate === null || track.sampleRate === undefined ? null : Number(track.sampleRate);
  const fileSize = Number(track.fileSize ?? 0);

  if (!Number.isFinite(duration) || duration <= 0) reasons.push('zero-duration');
  else if (duration > 3 * 60 * 60) reasons.push('extreme-duration');
  if (bitrate === null || !Number.isFinite(bitrate) || bitrate <= 0) reasons.push('missing-bitrate');
  if (sampleRate === null || !Number.isFinite(sampleRate) || sampleRate <= 0) reasons.push('missing-sample-rate');
  if (fileSize > 0 && fileSize < 10 * 1024) reasons.push('tiny-file');

  return reasons;
}

export function computeHealthScore(params: {
  totalTracks: number;
  totalAlbums: number;
  missingGenre: number;
  missingYear: number;
  missingArtworkAlbums: number;
  missingTrackNumber: number;
  unavailableTracks: number;
}): number {
  const penalty =
    params.missingGenre * 0.5 +
    params.missingYear * 0.5 +
    params.missingArtworkAlbums * 2 +
    params.missingTrackNumber * 0.5 +
    params.unavailableTracks * 3;
  const denominator = Math.max(1, params.totalTracks + params.totalAlbums);
  return Math.max(0, Math.min(100, Math.round(100 - (penalty / denominator) * 100)));
}

function parseIgnoredIssues(raw: string | null | undefined): IgnoredHealthIssue[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const seen = new Set<string>();
    const result: IgnoredHealthIssue[] = [];
    for (const entry of parsed) {
      if (!entry || typeof entry !== 'object') continue;
      const type = String((entry as any).type || '');
      const signature = String((entry as any).signature || '');
      if (!isHealthIssueType(type) || !signature) continue;
      const key = `${type}:${signature}`;
      if (seen.has(key)) continue;
      seen.add(key);
      result.push({
        type,
        signature,
        label: typeof (entry as any).label === 'string' ? (entry as any).label : undefined,
        ignoredAt: typeof (entry as any).ignoredAt === 'string' ? (entry as any).ignoredAt : new Date(0).toISOString(),
      });
    }
    return result;
  } catch {
    return [];
  }
}

let ignoredCache: { at: number; list: IgnoredHealthIssue[] } | null = null;
let overviewCache: { at: number; data: any } | null = null;
const OVERVIEW_CACHE_MS = 30000;

export async function getIgnoredHealthIssues(force = false): Promise<IgnoredHealthIssue[]> {
  if (!force && ignoredCache && Date.now() - ignoredCache.at < IGNORED_CACHE_MS) {
    return ignoredCache.list;
  }

  try {
    const row = await prisma.setting.findUnique({ where: { key: IGNORED_SETTING_KEY } });
    const list = parseIgnoredIssues(row?.value);
    ignoredCache = { at: Date.now(), list };
    return list;
  } catch {
    return ignoredCache?.list ?? [];
  }
}

async function persistIgnoredIssues(list: IgnoredHealthIssue[]): Promise<void> {
  const value = JSON.stringify(list);
  await prisma.setting.upsert({
    where: { key: IGNORED_SETTING_KEY },
    update: { value, description: 'Library Health Center ignored diagnostics' },
    create: {
      key: IGNORED_SETTING_KEY,
      value,
      description: 'Library Health Center ignored diagnostics',
    },
  });
  ignoredCache = { at: Date.now(), list };
  overviewCache = null;
}

export async function ignoreHealthIssue(
  type: string,
  signature: string,
  label?: string
): Promise<{ success: boolean; error?: string; total: number }> {
  if (!isHealthIssueType(type)) {
    return { success: false, error: 'Unknown issue type', total: 0 };
  }
  if (!isIgnorableIssueType(type)) {
    return { success: false, error: 'This issue type cannot be ignored', total: 0 };
  }
  if (!signature || signature.length > 512) {
    return { success: false, error: 'Invalid issue signature', total: 0 };
  }

  const list = await getIgnoredHealthIssues(true);
  if (!list.some((entry) => entry.type === type && entry.signature === signature)) {
    list.push({
      type,
      signature,
      label: label ? label.slice(0, 200) : undefined,
      ignoredAt: new Date().toISOString(),
    });
    await persistIgnoredIssues(list);
  }

  return { success: true, total: list.length };
}

export async function unignoreHealthIssues(
  type?: string,
  signature?: string
): Promise<{ success: boolean; removed: number; total: number; error?: string }> {
  if (type !== undefined && !isHealthIssueType(type)) {
    return { success: false, removed: 0, total: 0, error: 'Unknown issue type' };
  }

  const list = await getIgnoredHealthIssues(true);
  let next = list;
  if (type) {
    next = list.filter(
      (entry) => !(entry.type === type && (signature === undefined || entry.signature === signature))
    );
  } else if (signature !== undefined) {
    next = list.filter((entry) => entry.signature !== signature);
  } else {
    next = [];
  }

  const removed = list.length - next.length;
  if (removed > 0) {
    await persistIgnoredIssues(next);
    overviewCache = null;
  }
  return { success: true, removed, total: next.length };
}

function ignoredKeySet(ignored: IgnoredHealthIssue[]): Set<string> {
  return new Set(ignored.map((entry) => `${entry.type}:${entry.signature}`));
}

function countIgnoredByType(ignored: IgnoredHealthIssue[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const entry of ignored) {
    counts[entry.type] = (counts[entry.type] || 0) + 1;
  }
  return counts;
}

function ignoredSignatures(ignored: IgnoredHealthIssue[], type: HealthIssueType): string[] {
  return ignored
    .filter((entry) => entry.type === type)
    .map((entry) => entry.signature)
    .slice(0, MAX_IGNORED_IDS_PER_QUERY);
}

function notInClause(column: string, ids: string[]): { sql: string; params: string[] } {
  if (ids.length === 0) return { sql: '', params: [] };
  return {
    sql: ` AND ${column} NOT IN (${ids.map(() => '?').join(',')})`,
    params: ids,
  };
}

function pathExists(target: string): boolean {
  try {
    return fs.existsSync(target);
  } catch {
    return false;
  }
}

interface RootHealth {
  id: string;
  name: string;
  path: string;
  isEnabled: boolean;
  exists: boolean;
  healthy: boolean;
  trackCount: number;
  lastScannedAt: string | null;
}

async function getRootHealth(): Promise<RootHealth[]> {
  const [roots, counts] = await Promise.all([
    prisma.libraryRoot.findMany({ orderBy: { name: 'asc' } }),
    prisma.track.groupBy({
      by: ['rootId'],
      where: { isUnavailable: false },
      _count: { id: true },
    }),
  ]);

  const countMap = new Map(counts.map((entry) => [entry.rootId, entry._count.id]));
  return roots.map((root) => {
    const exists = pathExists(root.path);
    return {
      id: root.id,
      name: root.name,
      path: root.path,
      isEnabled: root.isEnabled,
      exists,
      healthy: !root.isEnabled || exists,
      trackCount: countMap.get(root.id) ?? 0,
      lastScannedAt: root.lastScannedAt ? root.lastScannedAt.toISOString() : null,
    };
  });
}

function formatHealthTrack(row: any) {
  return {
    id: row.id,
    rootId: row.rootId,
    collectionName: row.rootName || 'Library',
    relativePath: row.relativePath,
    filename: row.filename,
    extension: row.extension,
    fileSize: Number(row.fileSize || 0),
    title: row.title,
    trackNumber: row.trackNumber,
    discNumber: row.discNumber,
    duration: Number(row.duration || 0),
    year: row.year,
    genre: row.genre,
    codec: row.codec,
    bitrate: row.bitrate,
    sampleRate: row.sampleRate,
    bitDepth: row.bitDepth,
    channels: row.channels,
    isLossless: Boolean(row.isLossless),
    artistId: row.artistId,
    artistName: row.artistName,
    albumId: row.albumId,
    albumTitle: row.albumTitle,
    albumArtist: row.albumArtist,
    folderArtist: row.folderArtist,
    folderAlbum: row.folderAlbum,
    folderPath: row.folderPath,
    artworkId: row.artworkId,
    isFavorite: false,
    rating: null,
    localPlayCount: 0,
    importedPlayCount: 0,
    combinedPlayCount: 0,
    dateAdded: new Date().toISOString(),
  };
}

const DUPLICATE_GROUP_SQL = `
  SELECT
    lower(trim(t.title)) AS nt,
    lower(trim(t.artistName)) AS na,
    CAST(ROUND(t.duration) AS INTEGER) AS nd,
    COUNT(*) AS cnt
  FROM Track t
  WHERE t.isUnavailable = 0
    AND TRIM(t.title) <> ''
    AND t.duration > 0
  GROUP BY nt, na, nd
  HAVING COUNT(DISTINCT t.fullPath) > 1
`;

const SPLIT_ALBUM_GROUP_SQL = `
  SELECT
    a.normalizedTitle AS nt,
    COALESCE(a.artistId, '') AS aid,
    COALESCE(a.year, 0) AS yr,
    COUNT(*) AS cnt
  FROM Album a
  WHERE EXISTS (SELECT 1 FROM Track t WHERE t.albumId = a.id AND t.isUnavailable = 0)
  GROUP BY nt, aid, yr
  HAVING COUNT(*) > 1
`;

const DUPLICATE_ARTIST_GROUP_SQL = `
  SELECT lower(trim(a.normalizedName)) AS nn, COUNT(*) AS cnt
  FROM Artist a
  GROUP BY nn
  HAVING COUNT(*) > 1
`;

const MISSING_ARTWORK_WHERE = `
  a.artworkId IS NULL
  AND EXISTS (SELECT 1 FROM Track t WHERE t.albumId = a.id AND t.isUnavailable = 0)
`;

const METADATA_GAP_WHERE = `
  t.isUnavailable = 0
  AND (t.genre IS NULL OR TRIM(t.genre) = '' OR t.year IS NULL OR t.trackNumber IS NULL)
`;

const SUSPICIOUS_AUDIO_WHERE = `
  t.isUnavailable = 0
  AND (
    t.duration <= 0
    OR t.bitrate IS NULL OR t.bitrate <= 0
    OR t.sampleRate IS NULL OR t.sampleRate <= 0
    OR t.fileSize < 10240
  )
`;

export async function getHealthOverview(force = false) {
  if (!force && overviewCache && Date.now() - overviewCache.at < OVERVIEW_CACHE_MS) {
    return overviewCache.data;
  }

  const ignored = await getIgnoredHealthIssues(true);
  const ignoredSet = ignoredKeySet(ignored);
  const ignoredByType = countIgnoredByType(ignored);

  const metadataGapIgnored = notInClause('t.id', ignoredSignatures(ignored, 'metadata-gaps'));
  const suspiciousIgnored = notInClause('t.id', ignoredSignatures(ignored, 'suspicious-audio'));

  const [
    totalTracks,
    totalAlbums,
    totalArtists,
    totalRoots,
    unavailableTracks,
    aggregate,
    metaRows,
    gapCountRows,
    suspiciousCountRows,
    duplicateRows,
    splitRows,
    artistRows,
    missingArtworkRows,
    roots,
  ] = await Promise.all([
    prisma.track.count({ where: { isUnavailable: false } }),
    prisma.album.count(),
    prisma.artist.count(),
    prisma.libraryRoot.count({ where: { isEnabled: true } }),
    prisma.track.count({ where: { isUnavailable: true } }),
    prisma.track.aggregate({
      where: { isUnavailable: false },
      _sum: { duration: true, fileSize: true },
    }),
    prisma.$queryRawUnsafe<any[]>(`
      SELECT
        COALESCE(SUM(CASE WHEN t.genre IS NULL OR TRIM(t.genre) = '' THEN 1 ELSE 0 END), 0) AS missingGenre,
        COALESCE(SUM(CASE WHEN t.year IS NULL THEN 1 ELSE 0 END), 0) AS missingYear,
        COALESCE(SUM(CASE WHEN t.trackNumber IS NULL THEN 1 ELSE 0 END), 0) AS missingTrackNumber
      FROM Track t
      WHERE t.isUnavailable = 0
    `),
    prisma.$queryRawUnsafe<any[]>(
      `SELECT COUNT(*) AS cnt FROM Track t WHERE ${METADATA_GAP_WHERE}${metadataGapIgnored.sql}`,
      ...metadataGapIgnored.params
    ),
    prisma.$queryRawUnsafe<any[]>(
      `SELECT COUNT(*) AS cnt FROM Track t WHERE ${SUSPICIOUS_AUDIO_WHERE}${suspiciousIgnored.sql}`,
      ...suspiciousIgnored.params
    ),
    prisma.$queryRawUnsafe<any[]>(DUPLICATE_GROUP_SQL),
    prisma.$queryRawUnsafe<any[]>(SPLIT_ALBUM_GROUP_SQL),
    prisma.$queryRawUnsafe<any[]>(DUPLICATE_ARTIST_GROUP_SQL),
    prisma.$queryRawUnsafe<any[]>(`SELECT a.id FROM Album a WHERE ${MISSING_ARTWORK_WHERE}`),
    getRootHealth(),
  ]);

  const meta = metaRows[0] || {};
  const missingGenre = Number(meta.missingGenre || 0);
  const missingYear = Number(meta.missingYear || 0);
  const missingTrackNumber = Number(meta.missingTrackNumber || 0);
  const metadataGapTracks = Number(gapCountRows[0]?.cnt || 0);
  const suspiciousTracks = Number(suspiciousCountRows[0]?.cnt || 0);

  const duplicateGroups = duplicateRows
    .map((row) => ({
      signature: issueSignature('duplicates', [row.nt, row.na, row.nd]),
      trackCount: Number(row.cnt || 0),
    }))
    .filter((group) => !ignoredSet.has(`duplicates:${group.signature}`));

  const splitGroups = splitRows
    .map((row) => ({
      signature: issueSignature('split-albums', [row.nt, row.aid, row.yr]),
      albumCount: Number(row.cnt || 0),
    }))
    .filter((group) => !ignoredSet.has(`split-albums:${group.signature}`));

  const artistGroups = artistRows
    .map((row) => ({
      signature: issueSignature('duplicate-artists', [row.nn]),
      artistCount: Number(row.cnt || 0),
    }))
    .filter((group) => !ignoredSet.has(`duplicate-artists:${group.signature}`));

  const missingArtworkAlbums = missingArtworkRows.filter(
    (row) => !ignoredSet.has(`missing-artwork:${row.id}`)
  ).length;

  const duplicateTrackCount = duplicateGroups.reduce((sum, group) => sum + group.trackCount, 0);
  const splitAlbumCount = splitGroups.reduce((sum, group) => sum + group.albumCount, 0);
  const duplicateArtistCount = artistGroups.reduce((sum, group) => sum + group.artistCount, 0);
  const unhealthyRoots = roots.filter((root) => !root.healthy).length;

  const healthScore = computeHealthScore({
    totalTracks,
    totalAlbums,
    missingGenre,
    missingYear,
    missingArtworkAlbums,
    missingTrackNumber,
    unavailableTracks,
  });

  const issues = [
    {
      type: 'roots' as const,
      count: unhealthyRoots,
      secondaryCount: 0,
      ignoredCount: 0,
      ...HEALTH_ISSUE_META.roots,
    },
    {
      type: 'unavailable' as const,
      count: unavailableTracks,
      secondaryCount: 0,
      ignoredCount: 0,
      ...HEALTH_ISSUE_META.unavailable,
    },
    {
      type: 'missing-artwork' as const,
      count: missingArtworkAlbums,
      secondaryCount: 0,
      ignoredCount: ignoredByType['missing-artwork'] || 0,
      ...HEALTH_ISSUE_META['missing-artwork'],
    },
    {
      type: 'duplicates' as const,
      count: duplicateGroups.length,
      secondaryCount: duplicateTrackCount,
      ignoredCount: ignoredByType.duplicates || 0,
      ...HEALTH_ISSUE_META.duplicates,
    },
    {
      type: 'split-albums' as const,
      count: splitGroups.length,
      secondaryCount: splitAlbumCount,
      ignoredCount: ignoredByType['split-albums'] || 0,
      ...HEALTH_ISSUE_META['split-albums'],
    },
    {
      type: 'duplicate-artists' as const,
      count: artistGroups.length,
      secondaryCount: duplicateArtistCount,
      ignoredCount: ignoredByType['duplicate-artists'] || 0,
      ...HEALTH_ISSUE_META['duplicate-artists'],
    },
    {
      type: 'metadata-gaps' as const,
      count: metadataGapTracks,
      secondaryCount: 0,
      ignoredCount: ignoredByType['metadata-gaps'] || 0,
      ...HEALTH_ISSUE_META['metadata-gaps'],
    },
    {
      type: 'suspicious-audio' as const,
      count: suspiciousTracks,
      secondaryCount: 0,
      ignoredCount: ignoredByType['suspicious-audio'] || 0,
      ...HEALTH_ISSUE_META['suspicious-audio'],
    },
  ];

  const data = {
    generatedAt: new Date().toISOString(),
    totals: {
      tracks: totalTracks,
      albums: totalAlbums,
      artists: totalArtists,
      roots: totalRoots,
      totalDurationSeconds: aggregate._sum.duration || 0,
      totalFileSizeBytes: aggregate._sum.fileSize ? aggregate._sum.fileSize.toString() : '0',
    },
    metadataHealth: {
      missingGenre,
      missingYear,
      missingTrackNumber,
      missingArtworkAlbums,
      unavailableTracks,
      healthScore,
    },
    issues,
    roots,
    ignoredTotal: ignored.length,
    scan: getScanStatus(),
  };

  overviewCache = { at: Date.now(), data };
  return data;
}

function clampLimit(value: number | undefined, fallback: number, max: number): number {
  if (!Number.isFinite(value) || value === undefined) return fallback;
  return Math.min(max, Math.max(1, Math.floor(value)));
}

function clampOffset(value: number | undefined): number {
  if (!Number.isFinite(value) || value === undefined) return 0;
  return Math.max(0, Math.floor(value));
}

export async function getHealthIssueDetails(type: HealthIssueType, options: HealthIssueQueryOptions = {}) {
  const limit = clampLimit(options.limit, 100, 500);
  const offset = clampOffset(options.offset);
  const ignored = await getIgnoredHealthIssues(true);
  const ignoredSet = ignoredKeySet(ignored);

  if (type === 'roots') {
    const roots = await getRootHealth();
    return {
      type,
      total: roots.filter((root) => !root.healthy).length,
      limit,
      offset,
      roots,
    };
  }

  if (type === 'unavailable') {
    const [countRows, trackRows, roots] = await Promise.all([
      prisma.$queryRawUnsafe<any[]>(`SELECT COUNT(*) AS cnt FROM Track t WHERE t.isUnavailable = 1`),
      prisma.$queryRawUnsafe<any[]>(
        `
        SELECT t.*, r.name AS rootName, r.path AS rootPath
        FROM Track t
        LEFT JOIN LibraryRoot r ON r.id = t.rootId
        WHERE t.isUnavailable = 1
        ORDER BY t.artistName ASC, t.albumTitle ASC, t.discNumber ASC, t.trackNumber ASC
        LIMIT ? OFFSET ?
        `,
        limit,
        offset
      ),
      getRootHealth(),
    ]);
    const rootMap = new Map(roots.map((root) => [root.id, root]));
    return {
      type,
      total: Number(countRows[0]?.cnt || 0),
      limit,
      offset,
      tracks: trackRows.map((row) => ({
        ...formatHealthTrack(row),
        rootName: row.rootName || null,
        rootPath: row.rootPath || null,
        rootExists: rootMap.get(row.rootId)?.exists ?? false,
      })),
    };
  }

  if (type === 'missing-artwork') {
    const ignoredIds = ignoredSignatures(ignored, type);
    const exclude = notInClause('a.id', ignoredIds);
    const [countRows, albumRows] = await Promise.all([
      prisma.$queryRawUnsafe<any[]>(
        `SELECT COUNT(*) AS cnt FROM Album a WHERE ${MISSING_ARTWORK_WHERE}${exclude.sql}`,
        ...exclude.params
      ),
      prisma.$queryRawUnsafe<any[]>(
        `
        SELECT
          a.id,
          a.title,
          a.year,
          a.artistId,
          art.name AS artistName,
          a.folderKey,
          (SELECT COUNT(*) FROM Track t WHERE t.albumId = a.id AND t.isUnavailable = 0) AS trackCount,
          (SELECT t.folderPath FROM Track t WHERE t.albumId = a.id AND t.isUnavailable = 0 LIMIT 1) AS folderPath,
          (SELECT t.artworkId FROM Track t WHERE t.albumId = a.id AND t.isUnavailable = 0 AND t.artworkId IS NOT NULL LIMIT 1) AS trackArtworkId
        FROM Album a
        LEFT JOIN Artist art ON art.id = a.artistId
        WHERE ${MISSING_ARTWORK_WHERE}${exclude.sql}
        ORDER BY art.name ASC, a.year ASC, a.title ASC
        LIMIT ? OFFSET ?
        `,
        ...exclude.params,
        limit,
        offset
      ),
    ]);

    return {
      type,
      total: Number(countRows[0]?.cnt || 0),
      limit,
      offset,
      albums: albumRows.map((row) => ({
        signature: row.id,
        id: row.id,
        title: row.title,
        year: row.year,
        artistId: row.artistId,
        artistName: row.artistName || 'Unknown Artist',
        trackCount: Number(row.trackCount || 0),
        folderKey: row.folderKey || null,
        folderPath: row.folderPath || null,
        trackArtworkId: row.trackArtworkId || null,
      })),
    };
  }

  if (type === 'duplicates') {
    const groupRows = await prisma.$queryRawUnsafe<any[]>(DUPLICATE_GROUP_SQL);
    const visible = groupRows
      .map((row) => ({
        nt: String(row.nt),
        na: String(row.na),
        nd: Number(row.nd),
        cnt: Number(row.cnt || 0),
        signature: issueSignature('duplicates', [row.nt, row.na, row.nd]),
      }))
      .filter((group) => !ignoredSet.has(`duplicates:${group.signature}`));

    const page = visible.slice(offset, offset + limit);
    const groups: any[] = [];

    if (page.length > 0) {
      const valuesSql = page.map(() => '(?, ?, ?)').join(', ');
      const params = page.flatMap((group) => [group.nt, group.na, group.nd]);
      const trackRows = await prisma.$queryRawUnsafe<any[]>(
        `
        WITH selected(nt, na, nd) AS (VALUES ${valuesSql})
        SELECT
          t.*,
          r.name AS rootName,
          lower(trim(t.title)) AS groupTitle,
          lower(trim(t.artistName)) AS groupArtist,
          CAST(ROUND(t.duration) AS INTEGER) AS groupDuration
        FROM Track t
        JOIN selected s
          ON lower(trim(t.title)) = s.nt
         AND lower(trim(t.artistName)) = s.na
         AND CAST(ROUND(t.duration) AS INTEGER) = s.nd
        LEFT JOIN LibraryRoot r ON r.id = t.rootId
        WHERE t.isUnavailable = 0
        ORDER BY t.artistName ASC, t.title ASC, t.albumTitle ASC, t.discNumber ASC, t.trackNumber ASC
        `,
        ...params
      );

      const trackMap = new Map<string, any[]>();
      for (const row of trackRows) {
        const key = `${row.groupTitle}\u0001${row.groupArtist}\u0001${row.groupDuration}`;
        const list = trackMap.get(key) || [];
        list.push(formatHealthTrack(row));
        trackMap.set(key, list);
      }

      for (const group of page) {
        const key = `${group.nt}\u0001${group.na}\u0001${group.nd}`;
        const tracks = trackMap.get(key) || [];
        groups.push({
          signature: group.signature,
          title: tracks[0]?.title || group.nt,
          artistName: tracks[0]?.artistName || group.na,
          duration: group.nd,
          trackCount: group.cnt,
          tracks,
        });
      }
    }

    return {
      type,
      total: visible.length,
      totalTracks: visible.reduce((sum, group) => sum + group.cnt, 0),
      limit,
      offset,
      groups,
    };
  }

  if (type === 'split-albums') {
    const groupRows = await prisma.$queryRawUnsafe<any[]>(SPLIT_ALBUM_GROUP_SQL);
    const visible = groupRows
      .map((row) => ({
        nt: String(row.nt),
        aid: String(row.aid || ''),
        yr: Number(row.yr || 0),
        cnt: Number(row.cnt || 0),
        signature: issueSignature('split-albums', [row.nt, row.aid, row.yr]),
      }))
      .filter((group) => !ignoredSet.has(`split-albums:${group.signature}`));

    const page = visible.slice(offset, offset + limit);
    const groups: any[] = [];

    if (page.length > 0) {
      const valuesSql = page.map(() => '(?, ?, ?)').join(', ');
      const params = page.flatMap((group) => [group.nt, group.aid, group.yr]);
      const albumRows = await prisma.$queryRawUnsafe<any[]>(
        `
        WITH selected(nt, aid, yr) AS (VALUES ${valuesSql})
        SELECT
          a.id,
          a.title,
          a.year,
          a.artistId,
          a.artworkId,
          a.folderKey,
          a.normalizedTitle AS groupTitle,
          COALESCE(a.artistId, '') AS groupArtist,
          COALESCE(a.year, 0) AS groupYear,
          art.name AS artistName,
          (SELECT COUNT(*) FROM Track t WHERE t.albumId = a.id AND t.isUnavailable = 0) AS trackCount
        FROM Album a
        JOIN selected s
          ON a.normalizedTitle = s.nt
         AND COALESCE(a.artistId, '') = s.aid
         AND COALESCE(a.year, 0) = s.yr
        LEFT JOIN Artist art ON art.id = a.artistId
        WHERE EXISTS (SELECT 1 FROM Track t WHERE t.albumId = a.id AND t.isUnavailable = 0)
        ORDER BY a.year ASC, a.title ASC
        `,
        ...params
      );

      const albumMap = new Map<string, any[]>();
      for (const row of albumRows) {
        const key = `${row.groupTitle}\u0001${row.groupArtist}\u0001${row.groupYear}`;
        const list = albumMap.get(key) || [];
        list.push({
          id: row.id,
          title: row.title,
          year: row.year,
          artistId: row.artistId,
          artistName: row.artistName || 'Unknown Artist',
          artworkId: row.artworkId,
          folderKey: row.folderKey,
          trackCount: Number(row.trackCount || 0),
        });
        albumMap.set(key, list);
      }

      for (const group of page) {
        const key = `${group.nt}\u0001${group.aid}\u0001${group.yr}`;
        const albums = albumMap.get(key) || [];
        groups.push({
          signature: group.signature,
          title: albums[0]?.title || group.nt,
          artistName: albums[0]?.artistName || 'Unknown Artist',
          year: group.yr || null,
          albumCount: group.cnt,
          albums,
        });
      }
    }

    return {
      type,
      total: visible.length,
      totalAlbums: visible.reduce((sum, group) => sum + group.cnt, 0),
      limit,
      offset,
      groups,
    };
  }

  if (type === 'duplicate-artists') {
    const groupRows = await prisma.$queryRawUnsafe<any[]>(DUPLICATE_ARTIST_GROUP_SQL);
    const visible = groupRows
      .map((row) => ({
        nn: String(row.nn || ''),
        cnt: Number(row.cnt || 0),
        signature: issueSignature('duplicate-artists', [row.nn]),
      }))
      .filter((group) => !ignoredSet.has(`duplicate-artists:${group.signature}`));

    const page = visible.slice(offset, offset + limit);
    const groups: any[] = [];

    if (page.length > 0) {
      const values = page.map(() => '(?)').join(', ');
      const artistRows = await prisma.$queryRawUnsafe<any[]>(
        `
        WITH selected(nn) AS (VALUES ${values})
        SELECT
          a.id,
          a.name,
          lower(trim(a.normalizedName)) AS groupName,
          a.photoPath,
          a.logoPath,
          COALESCE(tc.cnt, 0) AS trackCount,
          COALESCE(alc.cnt, 0) AS albumCount
        FROM Artist a
        JOIN selected s ON s.nn = lower(trim(a.normalizedName))
        LEFT JOIN (
          SELECT artistId, COUNT(*) AS cnt FROM Track WHERE isUnavailable = 0 GROUP BY artistId
        ) tc ON tc.artistId = a.id
        LEFT JOIN (
          SELECT artistId, COUNT(*) AS cnt FROM Album GROUP BY artistId
        ) alc ON alc.artistId = a.id
        ORDER BY a.name ASC
        `,
        ...page.map((group) => group.nn)
      );

      const artistMap = new Map<string, any[]>();
      for (const row of artistRows) {
        const list = artistMap.get(row.groupName) || [];
        list.push({
          id: row.id,
          name: row.name,
          trackCount: Number(row.trackCount || 0),
          albumCount: Number(row.albumCount || 0),
          hasPhoto: Boolean(row.photoPath),
          hasLogo: Boolean(row.logoPath),
        });
        artistMap.set(row.groupName, list);
      }

      for (const group of page) {
        const artists = artistMap.get(group.nn) || [];
        groups.push({
          signature: group.signature,
          normalizedName: group.nn,
          displayName: artists[0]?.name || group.nn,
          artistCount: group.cnt,
          artists,
        });
      }
    }

    return {
      type,
      total: visible.length,
      totalArtists: visible.reduce((sum, group) => sum + group.cnt, 0),
      limit,
      offset,
      groups,
    };
  }

  if (type === 'metadata-gaps') {
    const ignoredIds = ignoredSignatures(ignored, type);
    const exclude = notInClause('t.id', ignoredIds);
    const [countRows, breakdownRows, trackRows] = await Promise.all([
      prisma.$queryRawUnsafe<any[]>(
        `SELECT COUNT(*) AS cnt FROM Track t WHERE ${METADATA_GAP_WHERE}${exclude.sql}`,
        ...exclude.params
      ),
      prisma.$queryRawUnsafe<any[]>(`
        SELECT
          COALESCE(SUM(CASE WHEN t.genre IS NULL OR TRIM(t.genre) = '' THEN 1 ELSE 0 END), 0) AS missingGenre,
          COALESCE(SUM(CASE WHEN t.year IS NULL THEN 1 ELSE 0 END), 0) AS missingYear,
          COALESCE(SUM(CASE WHEN t.trackNumber IS NULL THEN 1 ELSE 0 END), 0) AS missingTrackNumber
        FROM Track t
        WHERE t.isUnavailable = 0
      `),
      prisma.$queryRawUnsafe<any[]>(
        `
        SELECT t.*, r.name AS rootName
        FROM Track t
        LEFT JOIN LibraryRoot r ON r.id = t.rootId
        WHERE ${METADATA_GAP_WHERE}${exclude.sql}
        ORDER BY t.artistName ASC, t.albumTitle ASC, t.discNumber ASC, t.trackNumber ASC
        LIMIT ? OFFSET ?
        `,
        ...exclude.params,
        limit,
        offset
      ),
    ]);

    const breakdownRow = breakdownRows[0] || {};
    return {
      type,
      total: Number(countRows[0]?.cnt || 0),
      limit,
      offset,
      breakdown: {
        missingGenre: Number(breakdownRow.missingGenre || 0),
        missingYear: Number(breakdownRow.missingYear || 0),
        missingTrackNumber: Number(breakdownRow.missingTrackNumber || 0),
      },
      tracks: trackRows.map((row) => ({
        ...formatHealthTrack(row),
        missing: trackMissingFields(row),
      })),
    };
  }

  if (type === 'suspicious-audio') {
    const ignoredIds = ignoredSignatures(ignored, type);
    const exclude = notInClause('t.id', ignoredIds);
    const [countRows, trackRows] = await Promise.all([
      prisma.$queryRawUnsafe<any[]>(
        `SELECT COUNT(*) AS cnt FROM Track t WHERE ${SUSPICIOUS_AUDIO_WHERE}${exclude.sql}`,
        ...exclude.params
      ),
      prisma.$queryRawUnsafe<any[]>(
        `
        SELECT t.*, r.name AS rootName
        FROM Track t
        LEFT JOIN LibraryRoot r ON r.id = t.rootId
        WHERE ${SUSPICIOUS_AUDIO_WHERE}${exclude.sql}
        ORDER BY t.artistName ASC, t.albumTitle ASC, t.discNumber ASC, t.trackNumber ASC
        LIMIT ? OFFSET ?
        `,
        ...exclude.params,
        limit,
        offset
      ),
    ]);

    return {
      type,
      total: Number(countRows[0]?.cnt || 0),
      limit,
      offset,
      tracks: trackRows.map((row) => ({
        ...formatHealthTrack(row),
        reasons: suspiciousAudioReasons(row),
      })),
    };
  }

  throw new Error(`Unsupported issue type: ${type}`);
}

export async function verifyLibraryFiles(options: { rootId?: string; limit?: number } = {}) {
  const limit = clampLimit(options.limit, 10000, 50000);
  const rootClause = options.rootId ? ' AND t.rootId = ?' : '';
  const params: any[] = options.rootId ? [options.rootId, limit] : [limit];

  const rows = await prisma.$queryRawUnsafe<any[]>(
    `
    SELECT
      t.id,
      t.rootId,
      t.fullPath,
      t.title,
      t.artistName,
      t.albumTitle,
      t.relativePath,
      r.name AS rootName
    FROM Track t
    LEFT JOIN LibraryRoot r ON r.id = t.rootId
    WHERE t.isUnavailable = 0${rootClause}
    ORDER BY t.rootId ASC, t.artistName ASC, t.albumTitle ASC, t.trackNumber ASC
    LIMIT ?
    `,
    ...params
  );

  const gate = pLimit(64);
  let missingCount = 0;
  const missing: any[] = [];

  await Promise.all(
    rows.map((row) =>
      gate(async () => {
        try {
          await fs.promises.access(row.fullPath, fs.constants.F_OK);
        } catch {
          missingCount += 1;
          if (missing.length < 500) {
            missing.push({
              id: row.id,
              rootId: row.rootId,
              rootName: row.rootName || null,
              title: row.title,
              artistName: row.artistName,
              albumTitle: row.albumTitle,
              relativePath: row.relativePath,
              fullPath: row.fullPath,
            });
          }
        }
      })
    )
  );

  missing.sort((a, b) => {
    const artistCompare = String(a.artistName || '').localeCompare(String(b.artistName || ''));
    if (artistCompare !== 0) return artistCompare;
    return String(a.albumTitle || '').localeCompare(String(b.albumTitle || ''));
  });

  const roots = await getRootHealth();
  return {
    checked: rows.length,
    limit,
    limited: rows.length >= limit,
    missingCount,
    missing,
    roots,
    mutated: false,
  };
}
