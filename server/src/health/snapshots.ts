import { prisma } from '../db.js';
import { getHealthOverview } from './healthService.js';
import type { ScanCompletedEvent } from './events.js';

export const HEALTH_SNAPSHOT_SETTING_KEY = 'healthSnapshots';
export const MAX_HEALTH_SNAPSHOTS = 40;

export interface HealthSnapshot {
  id: string;
  capturedAt: string;
  reason: 'scan' | 'manual';
  score: number;
  totals: {
    tracks: number;
    albums: number;
    artists: number;
  };
  metadata: {
    missingGenre: number;
    missingYear: number;
    missingTrackNumber: number;
    missingArtworkAlbums: number;
    unavailableTracks: number;
  };
  issues: Record<string, number>;
  ignoredTotal: number;
  scan?: {
    cancelled: boolean;
    errorsCount: number;
    tracksAdded: number;
    tracksUpdated: number;
  };
}

export interface CaptureSnapshotResult {
  stored: boolean;
  snapshot: HealthSnapshot | null;
  total: number;
}

let snapshotsCache: { at: number; list: HealthSnapshot[] } | null = null;
const SNAPSHOTS_CACHE_MS = 10000;

function toCount(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function parseSnapshots(raw: string | null | undefined): HealthSnapshot[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const result: HealthSnapshot[] = [];
    for (const entry of parsed) {
      if (!entry || typeof entry !== 'object') continue;
      const value = entry as any;
      if (!value.id || !value.capturedAt || typeof value.score !== 'number') continue;
      const issues: Record<string, number> = {};
      if (value.issues && typeof value.issues === 'object') {
        for (const [type, count] of Object.entries(value.issues)) {
          issues[type] = toCount(count);
        }
      }
      result.push({
        id: String(value.id),
        capturedAt: String(value.capturedAt),
        reason: value.reason === 'scan' ? 'scan' : 'manual',
        score: toCount(value.score),
        totals: {
          tracks: toCount(value.totals?.tracks),
          albums: toCount(value.totals?.albums),
          artists: toCount(value.totals?.artists),
        },
        metadata: {
          missingGenre: toCount(value.metadata?.missingGenre),
          missingYear: toCount(value.metadata?.missingYear),
          missingTrackNumber: toCount(value.metadata?.missingTrackNumber),
          missingArtworkAlbums: toCount(value.metadata?.missingArtworkAlbums),
          unavailableTracks: toCount(value.metadata?.unavailableTracks),
        },
        issues,
        ignoredTotal: toCount(value.ignoredTotal),
        scan: value.scan
          ? {
              cancelled: Boolean(value.scan.cancelled),
              errorsCount: toCount(value.scan.errorsCount),
              tracksAdded: toCount(value.scan.tracksAdded),
              tracksUpdated: toCount(value.scan.tracksUpdated),
            }
          : undefined,
      });
    }
    return result.slice(-MAX_HEALTH_SNAPSHOTS);
  } catch {
    return [];
  }
}

export async function getHealthSnapshots(force = false): Promise<HealthSnapshot[]> {
  if (!force && snapshotsCache && Date.now() - snapshotsCache.at < SNAPSHOTS_CACHE_MS) {
    return snapshotsCache.list;
  }

  try {
    const row = await prisma.setting.findUnique({ where: { key: HEALTH_SNAPSHOT_SETTING_KEY } });
    const list = parseSnapshots(row?.value);
    snapshotsCache = { at: Date.now(), list };
    return list;
  } catch {
    return snapshotsCache?.list ?? [];
  }
}

function sameDiagnostics(a: HealthSnapshot, b: HealthSnapshot): boolean {
  if (a.score !== b.score) return false;
  if (a.ignoredTotal !== b.ignoredTotal) return false;
  const types = new Set([...Object.keys(a.issues), ...Object.keys(b.issues)]);
  for (const type of types) {
    if ((a.issues[type] || 0) !== (b.issues[type] || 0)) return false;
  }
  return (
    a.totals.tracks === b.totals.tracks &&
    a.totals.albums === b.totals.albums &&
    a.metadata.missingGenre === b.metadata.missingGenre &&
    a.metadata.missingYear === b.metadata.missingYear &&
    a.metadata.missingTrackNumber === b.metadata.missingTrackNumber
  );
}

export async function captureHealthSnapshot(
  reason: 'scan' | 'manual',
  scanEvent?: ScanCompletedEvent
): Promise<CaptureSnapshotResult> {
  const overview = await getHealthOverview(true);
  const capturedAt = new Date().toISOString();
  const issues: Record<string, number> = {};
  for (const issue of overview.issues) {
    issues[issue.type] = issue.count;
  }

  const snapshot: HealthSnapshot = {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    capturedAt,
    reason,
    score: overview.metadataHealth.healthScore,
    totals: {
      tracks: overview.totals.tracks,
      albums: overview.totals.albums,
      artists: overview.totals.artists,
    },
    metadata: {
      missingGenre: overview.metadataHealth.missingGenre,
      missingYear: overview.metadataHealth.missingYear,
      missingTrackNumber: overview.metadataHealth.missingTrackNumber,
      missingArtworkAlbums: overview.metadataHealth.missingArtworkAlbums,
      unavailableTracks: overview.metadataHealth.unavailableTracks,
    },
    issues,
    ignoredTotal: overview.ignoredTotal,
    scan: scanEvent
      ? {
          cancelled: scanEvent.cancelled,
          errorsCount: scanEvent.errorsCount,
          tracksAdded: scanEvent.tracksAdded,
          tracksUpdated: scanEvent.tracksUpdated,
        }
      : undefined,
  };

  const existing = await getHealthSnapshots(true);
  const last = existing[existing.length - 1];
  if (last && sameDiagnostics(last, snapshot)) {
    return { stored: false, snapshot: last, total: existing.length };
  }

  const next = [...existing, snapshot].slice(-MAX_HEALTH_SNAPSHOTS);
  await prisma.setting.upsert({
    where: { key: HEALTH_SNAPSHOT_SETTING_KEY },
    update: {
      value: JSON.stringify(next),
      description: 'Library Health Center score history',
    },
    create: {
      key: HEALTH_SNAPSHOT_SETTING_KEY,
      value: JSON.stringify(next),
      description: 'Library Health Center score history',
    },
  });
  snapshotsCache = { at: Date.now(), list: next };

  return { stored: true, snapshot, total: next.length };
}
