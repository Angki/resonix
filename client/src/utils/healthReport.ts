import type {
  HealthArtworkDetail,
  HealthDuplicateArtistsDetail,
  HealthDuplicatesDetail,
  HealthIssueDetail,
  HealthIssueType,
  HealthMetadataGapsDetail,
  HealthRootsDetail,
  HealthSplitAlbumsDetail,
  HealthSuspiciousDetail,
  HealthUnavailableDetail,
  IgnoredHealthIssue,
  LibraryHealthOverview,
} from '../types';

const EXPORT_PAGE_SIZE = 500;

export interface HealthReportDiagnostic {
  type: HealthIssueType;
  label: string;
  severity: string;
  count: number;
  secondaryCount: number;
  ignoredCount: number;
  detail: HealthIssueDetail;
}

export interface HealthReport {
  app: 'Resonix Library Health Center';
  generatedAt: string;
  readOnly: true;
  library: LibraryHealthOverview['totals'];
  metadataHealth: LibraryHealthOverview['metadataHealth'];
  scan: LibraryHealthOverview['scan'];
  ignoredTotal: number;
  ignored: IgnoredHealthIssue[];
  diagnostics: HealthReportDiagnostic[];
}

function pageItemCount(type: HealthIssueType, page: HealthIssueDetail): number {
  if (type === 'roots') return (page as HealthRootsDetail).roots.length;
  if (type === 'missing-artwork') return (page as HealthArtworkDetail).albums.length;
  if (
    type === 'duplicates' ||
    type === 'split-albums' ||
    type === 'duplicate-artists'
  ) {
    return (page as HealthDuplicatesDetail | HealthSplitAlbumsDetail | HealthDuplicateArtistsDetail).groups.length;
  }
  return (page as HealthUnavailableDetail | HealthMetadataGapsDetail | HealthSuspiciousDetail).tracks.length;
}

function mergePages(type: HealthIssueType, pages: HealthIssueDetail[]): HealthIssueDetail {
  const last = pages[pages.length - 1];
  if (pages.length === 1 || type === 'roots') return last;

  if (type === 'missing-artwork') {
    return { ...last, albums: pages.flatMap((page) => (page as HealthArtworkDetail).albums) } as HealthArtworkDetail;
  }
  if (type === 'duplicates') {
    return { ...last, groups: pages.flatMap((page) => (page as HealthDuplicatesDetail).groups) } as HealthDuplicatesDetail;
  }
  if (type === 'split-albums') {
    return { ...last, groups: pages.flatMap((page) => (page as HealthSplitAlbumsDetail).groups) } as HealthSplitAlbumsDetail;
  }
  if (type === 'duplicate-artists') {
    return {
      ...last,
      groups: pages.flatMap((page) => (page as HealthDuplicateArtistsDetail).groups),
    } as HealthDuplicateArtistsDetail;
  }
  return {
    ...last,
    tracks: pages.flatMap(
      (page) =>
        (page as HealthUnavailableDetail | HealthMetadataGapsDetail | HealthSuspiciousDetail).tracks as any[]
    ),
  } as HealthIssueDetail;
}

export async function buildHealthReport(
  overview: LibraryHealthOverview,
  fetchDetails: (type: HealthIssueType, params: { limit: number; offset: number }) => Promise<HealthIssueDetail>,
  ignored: IgnoredHealthIssue[]
): Promise<HealthReport> {
  const diagnostics: HealthReportDiagnostic[] = [];

  for (const issue of overview.issues) {
    const pages: HealthIssueDetail[] = [];
    let offset = 0;

    while (true) {
      const page = await fetchDetails(issue.type, { limit: EXPORT_PAGE_SIZE, offset });
      pages.push(page);
      const itemCount = pageItemCount(issue.type, page);
      offset += itemCount;
      if (type_isSinglePage(issue.type) || itemCount === 0 || offset >= page.total) break;
    }

    diagnostics.push({
      type: issue.type,
      label: issue.label,
      severity: issue.severity,
      count: issue.count,
      secondaryCount: issue.secondaryCount,
      ignoredCount: issue.ignoredCount,
      detail: mergePages(issue.type, pages),
    });
  }

  return {
    app: 'Resonix Library Health Center',
    generatedAt: new Date().toISOString(),
    readOnly: true,
    library: overview.totals,
    metadataHealth: overview.metadataHealth,
    scan: overview.scan,
    ignoredTotal: ignored.length,
    ignored,
    diagnostics,
  };
}

function type_isSinglePage(type: HealthIssueType): boolean {
  return type === 'roots';
}

function formatDuration(seconds: number): string {
  if (!seconds || !Number.isFinite(seconds)) return '';
  const total = Math.round(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

interface CsvRow {
  issueType: string;
  severity: string;
  signature: string;
  group: string;
  title: string;
  artist: string;
  album: string;
  year: string | number;
  trackNumber: string | number;
  durationSeconds: string | number;
  fileSizeBytes: string | number;
  trackCount: string | number;
  details: string;
  path: string;
}

const CSV_HEADER = [
  'issue_type',
  'severity',
  'signature',
  'group',
  'title',
  'artist',
  'album',
  'year',
  'track_number',
  'duration_seconds',
  'file_size_bytes',
  'track_count',
  'details',
  'path',
];

function emptyRow(issueType: string, severity: string): CsvRow {
  return {
    issueType,
    severity,
    signature: '',
    group: '',
    title: '',
    artist: '',
    album: '',
    year: '',
    trackNumber: '',
    durationSeconds: '',
    fileSizeBytes: '',
    trackCount: '',
    details: '',
    path: '',
  };
}

export function healthReportToCsv(report: HealthReport): string {
  const rows: CsvRow[] = [];

  for (const diagnostic of report.diagnostics) {
    const { type, severity, detail } = diagnostic;

    if (type === 'roots') {
      for (const root of (detail as HealthRootsDetail).roots) {
        rows.push({
          ...emptyRow(type, severity),
          signature: root.id,
          title: root.name,
          trackCount: root.trackCount,
          details: `${root.healthy ? 'reachable' : 'missing'}${root.isEnabled ? '' : ' · disabled'}`,
          path: root.path,
        });
      }
      continue;
    }

    if (type === 'missing-artwork') {
      for (const album of (detail as HealthArtworkDetail).albums) {
        rows.push({
          ...emptyRow(type, severity),
          signature: album.signature,
          title: album.title,
          artist: album.artistName,
          album: album.title,
          year: album.year ?? '',
          trackCount: album.trackCount,
          details: album.trackArtworkId ? 'album has no artwork but tracks do' : 'no artwork',
          path: album.folderPath || album.folderKey || '',
        });
      }
      continue;
    }

    if (type === 'duplicates') {
      for (const group of (detail as HealthDuplicatesDetail).groups) {
        for (const track of group.tracks) {
          rows.push({
            ...emptyRow(type, severity),
            signature: group.signature,
            group: `${group.artistName} — ${group.title}`,
            title: track.title,
            artist: track.artistName,
            album: track.albumTitle,
            year: track.year ?? '',
            trackNumber: track.trackNumber ?? '',
            durationSeconds: track.duration,
            fileSizeBytes: track.fileSize,
            trackCount: group.trackCount,
            details: `group duration ${formatDuration(group.duration)} · ${track.collectionName}`,
            path: track.relativePath,
          });
        }
      }
      continue;
    }

    if (type === 'split-albums') {
      for (const group of (detail as HealthSplitAlbumsDetail).groups) {
        for (const album of group.albums) {
          rows.push({
            ...emptyRow(type, severity),
            signature: group.signature,
            group: `${group.artistName} — ${group.title}`,
            title: album.title,
            artist: album.artistName,
            album: album.title,
            year: album.year ?? '',
            trackCount: album.trackCount,
            details: `${group.albumCount} folders share this album identity`,
            path: album.folderKey || album.id,
          });
        }
      }
      continue;
    }

    if (type === 'duplicate-artists') {
      for (const group of (detail as HealthDuplicateArtistsDetail).groups) {
        for (const artist of group.artists) {
          rows.push({
            ...emptyRow(type, severity),
            signature: group.signature,
            group: group.displayName,
            title: artist.name,
            artist: artist.name,
            trackCount: artist.trackCount,
            details: `variant of "${group.normalizedName}" · ${artist.albumCount} albums`,
            path: artist.hasPhoto ? 'has photo' : '',
          });
        }
      }
      continue;
    }

    if (type === 'metadata-gaps') {
      for (const track of (detail as HealthMetadataGapsDetail).tracks) {
        rows.push({
          ...emptyRow(type, severity),
          signature: track.id,
          title: track.title,
          artist: track.artistName,
          album: track.albumTitle,
          year: track.year ?? '',
          trackNumber: track.trackNumber ?? '',
          durationSeconds: track.duration,
          fileSizeBytes: track.fileSize,
          details: `missing: ${track.missing.join(', ')}`,
          path: track.relativePath,
        });
      }
      continue;
    }

    if (type === 'suspicious-audio') {
      for (const track of (detail as HealthSuspiciousDetail).tracks) {
        rows.push({
          ...emptyRow(type, severity),
          signature: track.id,
          title: track.title,
          artist: track.artistName,
          album: track.albumTitle,
          year: track.year ?? '',
          trackNumber: track.trackNumber ?? '',
          durationSeconds: track.duration,
          fileSizeBytes: track.fileSize,
          details: track.reasons.join(', '),
          path: track.relativePath,
        });
      }
      continue;
    }

    for (const track of (detail as HealthUnavailableDetail).tracks) {
      rows.push({
        ...emptyRow(type, severity),
        signature: track.id,
        title: track.title,
        artist: track.artistName,
        album: track.albumTitle,
        year: track.year ?? '',
        trackNumber: track.trackNumber ?? '',
        durationSeconds: track.duration,
        fileSizeBytes: track.fileSize,
        details: `${track.rootName || 'Unknown root'}${track.rootExists ? '' : ' · offline'}`,
        path: track.relativePath,
      });
    }
  }

  const lines = [CSV_HEADER.join(',')];
  for (const row of rows) {
    lines.push(
      [
        row.issueType,
        row.severity,
        row.signature,
        row.group,
        row.title,
        row.artist,
        row.album,
        row.year,
        row.trackNumber,
        row.durationSeconds,
        row.fileSizeBytes,
        row.trackCount,
        row.details,
        row.path,
      ]
        .map(csvCell)
        .join(',')
    );
  }

  return lines.join('\r\n');
}

export function healthReportFilename(format: 'json' | 'csv', date = new Date()): string {
  const stamp = date.toISOString().replace(/[:.]/g, '-').slice(0, 19);
  return `resonix-health-${stamp}.${format}`;
}

export function downloadHealthReport(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
