import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Copy,
  Disc,
  Download,
  EyeOff,
  FileJson,
  FileSpreadsheet,
  FileWarning,
  Folder,
  FolderX,
  HardDrive,
  History,
  ImageOff,
  Layers,
  Loader2,
  Mic2,
  Music,
  Pause,
  Play,
  RefreshCw,
  RotateCcw,
  ScanSearch,
  ShieldCheck,
  Tags,
  Users,
  X,
} from 'lucide-react';
import { api } from '../api/client';
import { usePlayerStore } from '../store/playerStore';
import { useUiStore } from '../store/uiStore';
import {
  ArtworkIntegrityResult,
  ContentDuplicateGroup,
  ContentScanState,
  HealthArtworkDetail,
  HealthDuplicateArtistGroup,
  HealthDuplicateArtistsDetail,
  HealthDuplicateGroup,
  HealthDuplicatesDetail,
  HealthIssueDetail,
  HealthIssueType,
  HealthMetadataGapsDetail,
  HealthSeverity,
  HealthSnapshot,
  HealthSplitAlbumsDetail,
  HealthSplitGroup,
  HealthSuspiciousDetail,
  HealthUnavailableDetail,
  LibraryHealthOverview,
  Track,
  VerifyLibraryFilesResult,
} from '../types';
import {
  buildHealthReport,
  downloadHealthReport,
  healthReportFilename,
  healthReportToCsv,
} from '../utils/healthReport';

const PAGE_SIZE = 25;
const VERIFY_PAGE_SIZE = 25000;
const VERIFY_MISSING_LIMIT = 500;
const ARTWORK_VERIFY_PAGE_SIZE = 250;
const DEEP_SCAN_PREVIEW_GROUPS = 50;

function formatDuration(seconds: number): string {
  if (!seconds || !Number.isFinite(seconds)) return '--:--';
  const total = Math.round(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function formatBytes(bytes: number): string {
  if (!bytes || !Number.isFinite(bytes)) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const exponent = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / Math.pow(1024, exponent);
  return `${value >= 100 ? value.toFixed(0) : value.toFixed(1)} ${units[exponent]}`;
}

function scoreTone(score: number): { text: string; ring: string; label: string } {
  if (score >= 95) return { text: 'text-emerald-400', ring: '#34d399', label: 'Excellent' };
  if (score >= 90) return { text: 'text-lime-400', ring: '#a3e635', label: 'Good' };
  if (score >= 75) return { text: 'text-amber-400', ring: '#fbbf24', label: 'Needs attention' };
  return { text: 'text-red-400', ring: '#f87171', label: 'Critical' };
}

const Sparkline: React.FC<{ points: number[]; color: string }> = ({ points, color }) => {
  const width = 180;
  const height = 42;
  const pad = 4;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = Math.max(1, max - min);
  const coordinates = points.map((value, index) => {
    const x = pad + (index / Math.max(1, points.length - 1)) * (width - pad * 2);
    const y = height - pad - ((value - min) / span) * (height - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const last = coordinates[coordinates.length - 1]?.split(',') || null;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-[180px] h-[42px] shrink-0" aria-hidden="true">
      <polyline
        points={coordinates.join(' ')}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {last && <circle cx={last[0]} cy={last[1]} r="2.5" fill={color} />}
    </svg>
  );
};

const SEVERITY_STYLES: Record<HealthSeverity, { dot: string; badge: string; text: string }> = {
  critical: {
    dot: 'bg-red-500',
    badge: 'bg-red-950/60 text-red-300 border-red-900/60',
    text: 'text-red-400',
  },
  warning: {
    dot: 'bg-amber-500',
    badge: 'bg-amber-950/60 text-amber-300 border-amber-900/60',
    text: 'text-amber-400',
  },
  info: {
    dot: 'bg-cyan-500',
    badge: 'bg-cyan-950/60 text-cyan-300 border-cyan-900/60',
    text: 'text-cyan-400',
  },
};

const ISSUE_ICONS: Record<HealthIssueType, React.ReactNode> = {
  roots: <Folder size={15} />,
  unavailable: <FileWarning size={15} />,
  'missing-artwork': <ImageOff size={15} />,
  duplicates: <Copy size={15} />,
  'split-albums': <Layers size={15} />,
  'duplicate-artists': <Users size={15} />,
  'metadata-gaps': <Tags size={15} />,
  'suspicious-audio': <Activity size={15} />,
};

function secondaryUnit(type: HealthIssueType): string | null {
  if (type === 'duplicates') return 'tracks';
  if (type === 'split-albums') return 'albums';
  if (type === 'duplicate-artists') return 'artists';
  return null;
}

function primaryUnit(type: HealthIssueType): string {
  if (type === 'duplicates' || type === 'split-albums' || type === 'duplicate-artists') return 'groups';
  if (type === 'missing-artwork') return 'albums';
  if (type === 'roots') return 'unhealthy';
  return 'tracks';
}

interface IgnoreButtonProps {
  disabled: boolean;
  busy: boolean;
  onClick: () => void;
}

const IgnoreButton: React.FC<IgnoreButtonProps> = ({ disabled, busy, onClick }) => (
  <button
    onClick={onClick}
    disabled={disabled || busy}
    title={disabled ? 'Admin access required' : 'Hide this item from diagnostics. Library files are never modified.'}
    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono border border-charcoal-700 text-zinc-400 hover:text-zinc-100 hover:bg-charcoal-750 transition disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
  >
    {busy ? <Loader2 size={10} className="animate-spin" /> : <EyeOff size={10} />}
    <span>Ignore</span>
  </button>
);

interface TrackRowProps {
  track: Track;
  currentTrackId?: string;
  isPlaying: boolean;
  queue?: Track[];
  badges?: React.ReactNode;
  action?: React.ReactNode;
  onPlay: (track: Track, queue?: Track[]) => void;
  onNavigateAlbum?: (track: Track) => void;
}

const HealthTrackRow: React.FC<TrackRowProps> = ({
  track,
  currentTrackId,
  isPlaying,
  queue,
  badges,
  action,
  onPlay,
  onNavigateAlbum,
}) => {
  const isCurrent = currentTrackId === track.id;
  return (
    <div
      onDoubleClick={() => onPlay(track, queue)}
      className={`flex items-center gap-3 px-3 py-2 hover:bg-charcoal-800/60 transition group ${
        isCurrent ? 'bg-crimson-950/30 border-l-2 border-crimson-600' : ''
      }`}
    >
      <button
        onClick={() => onPlay(track, queue)}
        className="w-8 h-8 rounded bg-charcoal-800 border border-charcoal-750 flex items-center justify-center text-zinc-300 hover:text-white hover:border-crimson-700 transition shrink-0"
        title={isCurrent && isPlaying ? 'Pause' : 'Play'}
      >
        {isCurrent && isPlaying ? <Pause size={13} className="fill-current" /> : <Play size={13} className="fill-current ml-0.5" />}
      </button>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className={`text-xs font-medium truncate ${isCurrent ? 'text-crimson-400' : 'text-zinc-200'}`}>
            {track.title}
          </span>
          {badges}
        </div>
        <div className="text-[10.5px] text-zinc-500 truncate">
          {track.artistName} • {track.albumTitle}
          {track.codec ? ` • ${track.codec.toUpperCase()}` : ''}
          {track.bitrate ? ` • ${track.bitrate} kbps` : ''}
        </div>
        <div className="text-[9.5px] font-mono text-zinc-600 truncate">{track.relativePath || track.filename}</div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {action}
        <span className="font-mono text-[10.5px] text-zinc-500 w-11 text-right">{formatDuration(track.duration)}</span>
        {onNavigateAlbum && track.albumId && (
          <button
            onClick={() => onNavigateAlbum(track)}
            title="Open album"
            className="opacity-0 group-hover:opacity-100 p-1 text-zinc-500 hover:text-cyan-400 transition"
          >
            <Disc size={12} />
          </button>
        )}
      </div>
    </div>
  );
};

interface DeepScanGroupProps {
  group: ContentDuplicateGroup;
  currentTrackId?: string;
  isPlaying: boolean;
  onPlay: (track: Track, queue?: Track[]) => void;
  onNavigateAlbum: (albumId: string, title: string) => void;
}

const DeepScanGroup: React.FC<DeepScanGroupProps> = ({
  group,
  currentTrackId,
  isPlaying,
  onPlay,
  onNavigateAlbum,
}) => {
  const lead = group.tracks[0];
  const exact = group.matchType === 'exact';

  return (
    <div className="rounded-lg border border-charcoal-800 overflow-hidden bg-charcoal-850/60">
      <div className="flex items-center gap-2 px-2.5 py-1.5 border-b border-charcoal-800/70">
        <Copy size={11} className="text-amber-400 shrink-0" />
        <span className="text-[11px] font-medium text-zinc-200 truncate">
          {lead?.artistName} — {lead?.title}
        </span>
        <span
          className={`text-[8.5px] font-mono px-1.5 py-0.2 rounded border shrink-0 ${
            exact
              ? 'bg-emerald-950/50 text-emerald-300 border-emerald-900/60'
              : 'bg-amber-950/50 text-amber-300 border-amber-900/60'
          }`}
          title={
            exact
              ? 'Full SHA-256 of the file content matches'
              : 'Head/tail signature matches; full hash was skipped to bound scan cost'
          }
        >
          {exact ? 'EXACT' : 'SIGNATURE'}
        </span>
        <span className="text-[9px] font-mono text-zinc-500 ml-auto shrink-0">
          {group.trackCount.toLocaleString()} files · {formatBytes(group.totalBytes)}
        </span>
      </div>
      <div className="divide-y divide-charcoal-800/50">
        {group.tracks.map((track) => (
          <HealthTrackRow
            key={track.id}
            track={track}
            queue={group.tracks}
            currentTrackId={currentTrackId}
            isPlaying={isPlaying}
            onPlay={onPlay}
            onNavigateAlbum={(entry) => entry.albumId && onNavigateAlbum(entry.albumId, entry.albumTitle)}
            badges={
              <span className="text-[9px] font-mono text-zinc-500 shrink-0">
                {track.collectionName || track.rootName || 'Library'}
              </span>
            }
          />
        ))}
      </div>
      {group.truncated && (
        <div className="px-2.5 py-1 text-[9px] font-mono text-zinc-500 border-t border-charcoal-800/70">
          Showing first {group.tracks.length.toLocaleString()} of {group.trackCount.toLocaleString()} files.
        </div>
      )}
    </div>
  );
};

interface DetailProps {
  type: HealthIssueType;
  data: HealthIssueDetail | undefined;
  overview: LibraryHealthOverview;
  loading: boolean;
  isLoading: boolean;
  canIgnore: boolean;
  ignorePending: boolean;
  ignoredCount: number;
  scanRunning: boolean;
  currentTrackId?: string;
  isPlaying: boolean;
  onPlay: (track: Track, queue?: Track[]) => void;
  onIgnore: (type: HealthIssueType, signature: string, label?: string) => void;
  onRestoreType: (type: HealthIssueType) => void;
  onRescanRoot: (rootId: string) => void;
  onNavigateAlbum: (albumId: string, title: string) => void;
  onNavigateArtist: (artistId: string, name: string) => void;
  onNextPage: () => void;
  onPrevPage: () => void;
  artworkVerifyPending: boolean;
  artworkVerifyProgress: { checked: number; total: number } | null;
  onVerifyArtwork: () => void;
  deepScan: ContentScanState | undefined;
  deepScanLoading: boolean;
  onStartDeepScan: () => void;
  onCancelDeepScan: () => void;
}

const EmptyState: React.FC<{ label: string }> = ({ label }) => (
  <div className="p-10 text-center space-y-2">
    <CheckCircle2 size={30} className="mx-auto text-emerald-500/80" />
    <p className="text-sm text-zinc-300">{label}</p>
    <p className="text-[11px] text-zinc-500 font-mono">Nothing to fix in this category.</p>
  </div>
);

const HealthDetail: React.FC<DetailProps> = ({
  type,
  data,
  overview,
  loading,
  isLoading,
  canIgnore,
  ignorePending,
  ignoredCount,
  scanRunning,
  currentTrackId,
  isPlaying,
  onPlay,
  onIgnore,
  onRestoreType,
  onRescanRoot,
  onNavigateAlbum,
  onNavigateArtist,
  onNextPage,
  onPrevPage,
  artworkVerifyPending,
  artworkVerifyProgress,
  onVerifyArtwork,
  deepScan,
  deepScanLoading,
  onStartDeepScan,
  onCancelDeepScan,
}) => {
  const [deepScanExpanded, setDeepScanExpanded] = useState(false);

  if (loading || (isLoading && !data)) {
    return (
      <div className="p-10 flex items-center justify-center gap-2 text-zinc-500 font-mono text-xs">
        <Loader2 size={14} className="animate-spin" />
        <span>Analyzing {type.replace(/-/g, ' ')}…</span>
      </div>
    );
  }

  const total = data?.total ?? 0;
  const showIgnore = canIgnore && type !== 'roots' && type !== 'unavailable';
  const pageStart = data && total > 0 ? data.offset + 1 : 0;
  const pageEnd = data ? Math.min(data.offset + data.limit, total) : 0;

  const renderPagination = () =>
    data && total > 0 ? (
      <div className="flex items-center justify-between px-3 py-2 border-t border-charcoal-800 text-[10.5px] font-mono text-zinc-500">
        <span>
          {pageStart}–{pageEnd} of {total}
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={onPrevPage}
            disabled={data.offset <= 0}
            className="inline-flex items-center gap-1 px-2 py-1 rounded border border-charcoal-750 hover:bg-charcoal-800 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <ChevronLeft size={11} /> Prev
          </button>
          <button
            onClick={onNextPage}
            disabled={pageEnd >= total}
            className="inline-flex items-center gap-1 px-2 py-1 rounded border border-charcoal-750 hover:bg-charcoal-800 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Next <ChevronRight size={11} />
          </button>
        </div>
      </div>
    ) : null;

  const renderDeepScanPanel = () => {
    const scan = deepScan;
    const phase = scan?.phase ?? 'idle';
    const running = Boolean(scan?.isRunning);
    const percent =
      scan && scan.totalTracks > 0
        ? Math.min(100, Math.round((scan.processedTracks / scan.totalTracks) * 100))
        : 0;
    const exactGroups = scan ? scan.groups.filter((group) => group.matchType === 'exact').length : 0;
    const signatureGroups = scan ? scan.groups.length - exactGroups : 0;
    const groups = scan?.groups ?? [];
    const visibleGroups = deepScanExpanded ? groups : groups.slice(0, DEEP_SCAN_PREVIEW_GROUPS);

    return (
      <div className="border-b border-charcoal-800 bg-charcoal-900/40">
        <div className="flex flex-wrap items-start justify-between gap-2 px-3 py-2.5">
          <div className="flex items-start gap-2 min-w-0">
            <ScanSearch size={14} className="text-cyan-400 mt-0.5 shrink-0" />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] font-semibold text-zinc-200">Deep content scan</span>
                {phase !== 'idle' && (
                  <span
                    className={`text-[9px] font-mono px-1.5 py-0.2 rounded border ${
                      running
                        ? 'bg-cyan-950/50 text-cyan-300 border-cyan-900/60'
                        : phase === 'complete'
                        ? 'bg-charcoal-800 text-zinc-400 border-charcoal-700'
                        : 'bg-amber-950/50 text-amber-300 border-amber-900/60'
                    }`}
                  >
                    {phase.toUpperCase()}
                  </span>
                )}
                {!running && groups.length > 0 && (
                  <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-amber-950/50 text-amber-300 border border-amber-900/60">
                    {groups.length.toLocaleString()} duplicate groups
                  </span>
                )}
              </div>
              <p className="text-[10px] text-zinc-500 mt-0.5">
                Compares file content (size + head/tail signature, then full SHA-256) to catch byte-identical
                files with different tags. Read-only; only files sharing an exact byte size are hashed.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {running ? (
              <>
                <span className="text-[10px] font-mono text-zinc-400">
                  {(scan?.processedTracks ?? 0).toLocaleString()}
                  {(scan?.totalTracks ?? 0) > 0 ? ` / ${scan!.totalTracks.toLocaleString()}` : ''} files
                </span>
                {canIgnore && (
                  <button
                    onClick={onCancelDeepScan}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded border border-amber-900/60 bg-amber-950/30 text-[10px] font-mono text-amber-300 hover:bg-amber-950/50 transition"
                  >
                    <X size={10} /> Cancel
                  </button>
                )}
              </>
            ) : (
              canIgnore && (
                <button
                  onClick={onStartDeepScan}
                  disabled={deepScanLoading}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded border border-charcoal-700 text-[10px] font-mono text-zinc-300 hover:bg-charcoal-800 hover:border-cyan-800 transition disabled:opacity-40"
                >
                  {deepScanLoading ? <Loader2 size={10} className="animate-spin" /> : <ScanSearch size={10} />}
                  {phase === 'idle' ? 'Start scan' : 'Scan again'}
                </button>
              )
            )}
          </div>
        </div>

        {running && (
          <div className="px-3 pb-2.5 space-y-1">
            <div className="h-1 rounded-full bg-charcoal-800 overflow-hidden">
              <div
                className="h-full bg-cyan-500 transition-all duration-300"
                style={{ width: `${percent}%` }}
              />
            </div>
            <div className="text-[9.5px] font-mono text-zinc-500">
              {phase === 'indexing'
                ? `Hashing same-size candidate files · ${percent}%`
                : `Verifying ${scan?.candidateGroups ?? 0} candidate groups · ${scan?.verifiedGroups ?? 0} groups fully hashed`}
            </div>
          </div>
        )}

        {!running && phase !== 'idle' && (
          <div className="px-3 pb-3 space-y-2">
            <div className="flex flex-wrap items-center gap-1.5 text-[9.5px] font-mono">
              <span className="px-1.5 py-0.5 rounded bg-charcoal-800 border border-charcoal-750 text-zinc-400">
                {(scan?.processedTracks ?? 0).toLocaleString()} candidate files hashed
              </span>
              <span className="px-1.5 py-0.5 rounded bg-emerald-950/40 border border-emerald-900/50 text-emerald-300">
                {exactGroups.toLocaleString()} exact
              </span>
              {signatureGroups > 0 && (
                <span className="px-1.5 py-0.5 rounded bg-amber-950/40 border border-amber-900/50 text-amber-300">
                  {signatureGroups.toLocaleString()} signature-only
                </span>
              )}
              {scan?.truncated && (
                <span className="px-1.5 py-0.5 rounded bg-red-950/40 border border-red-900/50 text-red-300">
                  results truncated
                </span>
              )}
            </div>
            {scan && scan.errorCount > 0 && (
              <div className="text-[9.5px] font-mono text-amber-300/80">
                {scan.errorCount.toLocaleString()} file{scan.errorCount === 1 ? '' : 's'} could not be read.
              </div>
            )}
            {groups.length === 0 ? (
              <div className="flex items-center gap-1.5 text-[10.5px] text-emerald-300/90">
                <CheckCircle2 size={12} /> No byte-identical files found.
              </div>
            ) : (
              <div className="space-y-2">
                {visibleGroups.map((group) => (
                  <DeepScanGroup
                    key={group.signature}
                    group={group}
                    currentTrackId={currentTrackId}
                    isPlaying={isPlaying}
                    onPlay={onPlay}
                    onNavigateAlbum={onNavigateAlbum}
                  />
                ))}
                {groups.length > DEEP_SCAN_PREVIEW_GROUPS && !deepScanExpanded && (
                  <button
                    onClick={() => setDeepScanExpanded(true)}
                    className="w-full px-3 py-1.5 rounded-lg border border-charcoal-750 text-[10px] font-mono text-zinc-400 hover:bg-charcoal-800 hover:text-zinc-200 transition"
                  >
                    Show all {groups.length.toLocaleString()} groups
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  const renderBody = () => {
    if (type === 'roots') {
      if (overview.roots.length === 0) {
        return (
          <div className="p-8 text-center text-zinc-500 text-xs font-mono">No library roots configured.</div>
        );
      }
      return (
        <div className="divide-y divide-charcoal-800/60">
          {overview.roots.map((root) => (
            <div key={root.id} className="flex items-center gap-3 p-3 hover:bg-charcoal-800/40 transition">
              <div
                className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border ${
                  root.healthy
                    ? 'bg-emerald-950/40 border-emerald-900/50 text-emerald-400'
                    : 'bg-red-950/40 border-red-900/50 text-red-400'
                }`}
              >
                {root.healthy ? <Folder size={15} /> : <FolderX size={15} />}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-zinc-200 truncate">{root.name}</span>
                  {!root.isEnabled && (
                    <span className="text-[9px] font-mono px-1.5 py-0.2 rounded border border-charcoal-700 text-zinc-500">
                      DISABLED
                    </span>
                  )}
                  <span
                    className={`text-[9px] font-mono px-1.5 py-0.2 rounded border ${
                      root.healthy
                        ? 'bg-emerald-950/50 text-emerald-300 border-emerald-900/60'
                        : 'bg-red-950/50 text-red-300 border-red-900/60'
                    }`}
                  >
                    {root.healthy ? 'REACHABLE' : 'MISSING'}
                  </span>
                </div>
                <div className="text-[10px] font-mono text-zinc-500 truncate">{root.path}</div>
                <div className="text-[10px] text-zinc-600 font-mono">
                  {root.trackCount.toLocaleString()} tracks
                  {root.lastScannedAt ? ` · last scan ${new Date(root.lastScannedAt).toLocaleString()}` : ' · never scanned'}
                </div>
              </div>
              <button
                onClick={() => onRescanRoot(root.id)}
                disabled={scanRunning || !root.isEnabled}
                className="inline-flex items-center gap-1.5 px-2 py-1 rounded border border-charcoal-700 text-[10px] font-mono text-zinc-300 hover:bg-charcoal-800 hover:border-cyan-800 transition disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
              >
                <RefreshCw size={10} /> Rescan
              </button>
            </div>
          ))}
        </div>
      );
    }

    if (type === 'unavailable') {
      const detail = data as HealthUnavailableDetail | undefined;
      if (!detail || detail.tracks.length === 0) return <EmptyState label="No unavailable tracks detected." />;
      return (
        <div>
          <div className="divide-y divide-charcoal-800/60">
            {detail.tracks.map((track) => (
              <div key={track.id} className="flex items-center gap-3 px-3 py-2 hover:bg-charcoal-800/50 transition">
                <div className="w-8 h-8 rounded bg-red-950/40 border border-red-900/50 text-red-400 flex items-center justify-center shrink-0">
                  <FileWarning size={14} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-medium text-zinc-200 truncate">{track.title}</div>
                  <div className="text-[10.5px] text-zinc-500 truncate">
                    {track.artistName} • {track.albumTitle}
                  </div>
                  <div className="text-[9.5px] font-mono text-zinc-600 truncate">{track.relativePath}</div>
                </div>
                <div className="text-right shrink-0">
                  <span
                    className={`text-[9px] font-mono px-1.5 py-0.2 rounded border ${
                      track.rootExists
                        ? 'bg-charcoal-800 text-zinc-400 border-charcoal-700'
                        : 'bg-red-950/50 text-red-300 border-red-900/60'
                    }`}
                  >
                    {track.rootName || 'Unknown root'} {track.rootExists ? '' : '· offline'}
                  </span>
                  {track.albumId && (
                    <button
                      onClick={() => onNavigateAlbum(track.albumId!, track.albumTitle)}
                      className="ml-2 text-[10px] font-mono text-cyan-400 hover:text-cyan-300"
                    >
                      Open album
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
          {renderPagination()}
        </div>
      );
    }

    if (type === 'missing-artwork') {
      const detail = data as HealthArtworkDetail | undefined;
      const artworkPercent =
        artworkVerifyProgress && artworkVerifyProgress.total > 0
          ? Math.min(100, Math.round((artworkVerifyProgress.checked / artworkVerifyProgress.total) * 100))
          : 0;
      return (
        <div>
          <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 border-b border-charcoal-800 bg-charcoal-900/40">
            <span className="text-[10px] font-mono text-zinc-500">
              Checks album artwork records, cache masters and original images for missing or unreadable files.
              Read-only.
            </span>
            <button
              onClick={onVerifyArtwork}
              disabled={artworkVerifyPending}
              className="inline-flex items-center gap-1 px-2 py-1 rounded border border-charcoal-700 text-[10px] font-mono text-zinc-300 hover:bg-charcoal-800 hover:border-cyan-800 transition disabled:opacity-40"
            >
              {artworkVerifyPending ? <Loader2 size={10} className="animate-spin" /> : <ShieldCheck size={10} />}
              Verify artwork
            </button>
          </div>
          {artworkVerifyPending && (
            <div className="px-3 py-2 border-b border-charcoal-800 space-y-1">
              <div className="h-1 rounded-full bg-charcoal-800 overflow-hidden">
                <div
                  className="h-full bg-cyan-500 transition-all duration-300"
                  style={{ width: `${artworkPercent}%` }}
                />
              </div>
              <div className="text-[9px] font-mono text-zinc-500">
                Checked {(artworkVerifyProgress?.checked ?? 0).toLocaleString()}
                {artworkVerifyProgress && artworkVerifyProgress.total > 0
                  ? ` of ${artworkVerifyProgress.total.toLocaleString()}`
                  : ''}{' '}
                artwork records
              </div>
            </div>
          )}
          {!detail || detail.albums.length === 0 ? (
            <EmptyState label="Every album has cover artwork." />
          ) : (
            <>
              <div className="divide-y divide-charcoal-800/60">
            {detail.albums.map((album) => (
              <div key={album.id} className="flex items-center gap-3 p-3 hover:bg-charcoal-800/50 transition group">
                <div className="w-11 h-11 rounded bg-charcoal-800 border border-charcoal-750 overflow-hidden shrink-0 flex items-center justify-center text-zinc-600">
                  {album.trackArtworkId ? (
                    <img src={api.getArtworkUrl(album.trackArtworkId, 96)} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <ImageOff size={16} />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-medium text-zinc-200 truncate">{album.title}</div>
                  <div className="text-[10.5px] text-zinc-500 truncate">
                    {album.artistName}
                    {album.year ? ` • ${album.year}` : ''} • {album.trackCount} tracks
                  </div>
                  <div className="text-[9.5px] font-mono text-zinc-600 truncate">
                    {album.folderPath || album.folderKey || 'No folder identity'}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {showIgnore && (
                    <IgnoreButton
                      disabled={!canIgnore}
                      busy={ignorePending}
                      onClick={() => onIgnore(type, album.signature, `Artwork: ${album.artistName} — ${album.title}`)}
                    />
                  )}
                  <button
                    onClick={() => onNavigateAlbum(album.id, album.title)}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded border border-charcoal-700 text-[10px] font-mono text-zinc-300 hover:bg-charcoal-800 hover:border-cyan-800 transition"
                  >
                    <Disc size={10} /> Open
                  </button>
                </div>
              </div>
            ))}
              </div>
              {renderPagination()}
            </>
          )}
        </div>
      );
    }

    if (type === 'duplicates') {
      const detail = data as HealthDuplicatesDetail | undefined;
      return (
        <div>
          {renderDeepScanPanel()}
          {!detail || detail.groups.length === 0 ? (
            <EmptyState label="No metadata-based duplicate tracks detected." />
          ) : (
            <>
              <div className="divide-y divide-charcoal-800/60">
            {detail.groups.map((group: HealthDuplicateGroup) => (
              <div key={group.signature} className="p-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Copy size={12} className="text-amber-400 shrink-0" />
                      <span className="text-xs font-semibold text-zinc-200 truncate">{group.title}</span>
                      <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-amber-950/50 text-amber-300 border border-amber-900/60 shrink-0">
                        {group.trackCount} files
                      </span>
                    </div>
                    <div className="text-[10.5px] text-zinc-500 truncate mt-0.5">
                      {group.artistName} • {formatDuration(group.duration)}
                    </div>
                  </div>
                  {showIgnore && (
                    <IgnoreButton
                      disabled={!canIgnore}
                      busy={ignorePending}
                      onClick={() => onIgnore(type, group.signature, `${group.artistName} — ${group.title}`)}
                    />
                  )}
                </div>
                <div className="rounded-lg border border-charcoal-800 overflow-hidden bg-charcoal-900/50">
                  <div className="divide-y divide-charcoal-800/50">
                    {group.tracks.map((track) => (
                      <HealthTrackRow
                        key={track.id}
                        track={track}
                        queue={group.tracks}
                        currentTrackId={currentTrackId}
                        isPlaying={isPlaying}
                        onPlay={onPlay}
                        onNavigateAlbum={(t) => t.albumId && onNavigateAlbum(t.albumId, t.albumTitle)}
                        badges={
                          <span className="text-[9px] font-mono text-zinc-500 shrink-0">
                            {track.collectionName}
                          </span>
                        }
                      />
                    ))}
                  </div>
                </div>
              </div>
            ))}
              </div>
              {renderPagination()}
            </>
          )}
        </div>
      );
    }

    if (type === 'split-albums') {
      const detail = data as HealthSplitAlbumsDetail | undefined;
      if (!detail || detail.groups.length === 0) return <EmptyState label="No split albums detected." />;
      return (
        <div>
          <div className="divide-y divide-charcoal-800/60">
            {detail.groups.map((group: HealthSplitGroup) => (
              <div key={group.signature} className="p-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Layers size={12} className="text-amber-400 shrink-0" />
                      <span className="text-xs font-semibold text-zinc-200 truncate">{group.title}</span>
                      <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-amber-950/50 text-amber-300 border border-amber-900/60 shrink-0">
                        {group.albumCount} folders
                      </span>
                    </div>
                    <div className="text-[10.5px] text-zinc-500 truncate mt-0.5">
                      {group.artistName}
                      {group.year ? ` • ${group.year}` : ''}
                    </div>
                  </div>
                  {showIgnore && (
                    <IgnoreButton
                      disabled={!canIgnore}
                      busy={ignorePending}
                      onClick={() => onIgnore(type, group.signature, `${group.artistName} — ${group.title}`)}
                    />
                  )}
                </div>
                <div className="grid gap-1.5 sm:grid-cols-2">
                  {group.albums.map((album) => (
                    <button
                      key={album.id}
                      onClick={() => onNavigateAlbum(album.id, album.title)}
                      className="flex items-center gap-2 px-2 py-1.5 rounded-lg border border-charcoal-800 bg-charcoal-900/50 hover:border-cyan-800/70 hover:bg-charcoal-800/60 text-left transition"
                    >
                      <div className="w-8 h-8 rounded bg-charcoal-800 border border-charcoal-750 overflow-hidden shrink-0 flex items-center justify-center text-zinc-600">
                        {album.artworkId ? (
                          <img src={api.getArtworkUrl(album.artworkId, 96)} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <Disc size={13} />
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="text-[11px] text-zinc-200 truncate">{album.title}</div>
                        <div className="text-[9.5px] font-mono text-zinc-500 truncate">
                          {album.folderKey || album.id} • {album.trackCount} tracks
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
          {renderPagination()}
        </div>
      );
    }

    if (type === 'duplicate-artists') {
      const detail = data as HealthDuplicateArtistsDetail | undefined;
      if (!detail || detail.groups.length === 0) return <EmptyState label="No artist name variants detected." />;
      return (
        <div>
          <div className="divide-y divide-charcoal-800/60">
            {detail.groups.map((group: HealthDuplicateArtistGroup) => (
              <div key={group.signature} className="p-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Users size={12} className="text-amber-400 shrink-0" />
                      <span className="text-xs font-semibold text-zinc-200 truncate">{group.displayName}</span>
                      <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-amber-950/50 text-amber-300 border border-amber-900/60 shrink-0">
                        {group.artistCount} variants
                      </span>
                    </div>
                    <div className="text-[10.5px] text-zinc-500 font-mono truncate mt-0.5">
                      normalized: {group.normalizedName}
                    </div>
                  </div>
                  {showIgnore && (
                    <IgnoreButton
                      disabled={!canIgnore}
                      busy={ignorePending}
                      onClick={() => onIgnore(type, group.signature, `Artist variants: ${group.displayName}`)}
                    />
                  )}
                </div>
                <div className="grid gap-1.5 sm:grid-cols-2">
                  {group.artists.map((artist) => (
                    <button
                      key={artist.id}
                      onClick={() => onNavigateArtist(artist.id, artist.name)}
                      className="flex items-center gap-2 px-2 py-1.5 rounded-lg border border-charcoal-800 bg-charcoal-900/50 hover:border-cyan-800/70 hover:bg-charcoal-800/60 text-left transition"
                    >
                      <div className="w-8 h-8 rounded-full bg-charcoal-800 border border-charcoal-750 flex items-center justify-center text-zinc-500 shrink-0 overflow-hidden">
                        {artist.hasPhoto ? (
                          <img src={api.getArtistPhotoUrl(artist.id)} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <Mic2 size={13} />
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="text-[11px] text-zinc-200 truncate">{artist.name}</div>
                        <div className="text-[9.5px] font-mono text-zinc-500 truncate">
                          {artist.trackCount} tracks • {artist.albumCount} albums
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
          {renderPagination()}
        </div>
      );
    }

    if (type === 'metadata-gaps') {
      const detail = data as HealthMetadataGapsDetail | undefined;
      if (!detail || detail.tracks.length === 0) return <EmptyState label="All tracks have complete core metadata." />;
      return (
        <div>
          <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-b border-charcoal-800 bg-charcoal-900/40 text-[10px] font-mono">
            <span className="text-zinc-500">Missing fields:</span>
            <span className="px-1.5 py-0.5 rounded bg-charcoal-800 text-zinc-300 border border-charcoal-750">
              Genre {detail.breakdown.missingGenre.toLocaleString()}
            </span>
            <span className="px-1.5 py-0.5 rounded bg-charcoal-800 text-zinc-300 border border-charcoal-750">
              Year {detail.breakdown.missingYear.toLocaleString()}
            </span>
            <span className="px-1.5 py-0.5 rounded bg-charcoal-800 text-zinc-300 border border-charcoal-750">
              Track # {detail.breakdown.missingTrackNumber.toLocaleString()}
            </span>
          </div>
          <div className="divide-y divide-charcoal-800/60">
            {detail.tracks.map((track) => (
              <HealthTrackRow
                key={track.id}
                track={track}
                currentTrackId={currentTrackId}
                isPlaying={isPlaying}
                onPlay={onPlay}
                onNavigateAlbum={(t) => t.albumId && onNavigateAlbum(t.albumId, t.albumTitle)}
                badges={track.missing.map((field) => (
                  <span
                    key={field}
                    className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-cyan-950/50 text-cyan-300 border border-cyan-900/60 shrink-0"
                  >
                    no {field}
                  </span>
                ))}
                action={
                  showIgnore ? (
                    <IgnoreButton
                      disabled={!canIgnore}
                      busy={ignorePending}
                      onClick={() => onIgnore(type, track.id, `${track.artistName} — ${track.title}`)}
                    />
                  ) : null
                }
              />
            ))}
          </div>
          {renderPagination()}
        </div>
      );
    }

    if (type === 'suspicious-audio') {
      const detail = data as HealthSuspiciousDetail | undefined;
      if (!detail || detail.tracks.length === 0) return <EmptyState label="No suspicious audio files detected." />;
      return (
        <div>
          <div className="divide-y divide-charcoal-800/60">
            {detail.tracks.map((track) => (
              <HealthTrackRow
                key={track.id}
                track={track}
                currentTrackId={currentTrackId}
                isPlaying={isPlaying}
                onPlay={onPlay}
                onNavigateAlbum={(t) => t.albumId && onNavigateAlbum(t.albumId, t.albumTitle)}
                badges={track.reasons.map((reason) => (
                  <span
                    key={reason}
                    className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-amber-950/50 text-amber-300 border border-amber-900/60 shrink-0"
                  >
                    {reason}
                  </span>
                ))}
                action={
                  showIgnore ? (
                    <IgnoreButton
                      disabled={!canIgnore}
                      busy={ignorePending}
                      onClick={() => onIgnore(type, track.id, `${track.artistName} — ${track.title}`)}
                    />
                  ) : null
                }
              />
            ))}
          </div>
          {renderPagination()}
        </div>
      );
    }

    return null;
  };

  const issue = overview.issues.find((entry) => entry.type === type);

  return (
    <div className="bg-charcoal-850/90 border border-charcoal-800 rounded-xl overflow-hidden shadow-xl backdrop-blur-md min-h-[320px] flex flex-col">
      <div className="p-3.5 border-b border-charcoal-800 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-zinc-400">{ISSUE_ICONS[type]}</span>
            <h2 className="text-sm font-bold text-zinc-100 truncate">{issue?.label || type}</h2>
            {issue && issue.count > 0 && (
              <span
                className={`text-[9.5px] font-mono px-1.5 py-0.2 rounded border shrink-0 ${
                  SEVERITY_STYLES[issue.severity].badge
                }`}
              >
                {issue.count.toLocaleString()} {primaryUnit(type)}
              </span>
            )}
          </div>
          <p className="text-[10.5px] text-zinc-500 mt-0.5">{issue?.description}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {ignoredCount > 0 && (
            <span className="text-[9.5px] font-mono text-zinc-500">{ignoredCount} ignored</span>
          )}
          {issue?.ignorable && ignoredCount > 0 && canIgnore && (
            <button
              onClick={() => onRestoreType(type)}
              className="inline-flex items-center gap-1 px-2 py-1 rounded border border-charcoal-700 text-[10px] font-mono text-zinc-300 hover:bg-charcoal-800 transition"
            >
              <RotateCcw size={10} /> Restore
            </button>
          )}
        </div>
      </div>
      <div className="flex-1">{renderBody()}</div>
    </div>
  );
};

export const LibraryHealthView: React.FC = () => {
  const queryClient = useQueryClient();
  const [selectedType, setSelectedType] = useState<HealthIssueType>('roots');
  const [offset, setOffset] = useState(0);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [verifyResult, setVerifyResult] = useState<VerifyLibraryFilesResult | null>(null);
  const [verifyProgress, setVerifyProgress] = useState<{
    rootName: string;
    checked: number;
    total: number;
  } | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [ignoredOpen, setIgnoredOpen] = useState(false);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [exporting, setExporting] = useState<'json' | 'csv' | null>(null);
  const [artworkVerifyResult, setArtworkVerifyResult] = useState<ArtworkIntegrityResult | null>(null);
  const [artworkVerifyProgress, setArtworkVerifyProgress] = useState<{
    checked: number;
    total: number;
  } | null>(null);
  const previousScanRunning = useRef(false);

  const currentUser = useUiStore((state) => state.currentUser);
  const selectArtist = useUiStore((state) => state.selectArtist);
  const selectAlbum = useUiStore((state) => state.selectAlbum);
  const setActiveSection = useUiStore((state) => state.setActiveSection);
  const setViewMode = useUiStore((state) => state.setViewMode);

  const currentTrack = usePlayerStore((state) => state.currentTrack);
  const isPlaying = usePlayerStore((state) => state.isPlaying);
  const playTrack = usePlayerStore((state) => state.playTrack);
  const togglePlay = usePlayerStore((state) => state.togglePlay);

  const canIgnore = currentUser?.role === 'admin';

  const overviewQuery = useQuery({
    queryKey: ['library-health'],
    queryFn: () => api.getLibraryHealth(false),
    staleTime: 30_000,
  });

  const overview = overviewQuery.data;

  const detailQuery = useQuery({
    queryKey: ['library-health-issue', selectedType, offset],
    queryFn: () => api.getHealthIssueDetails(selectedType, { limit: PAGE_SIZE, offset }),
    enabled: selectedType !== 'roots',
    staleTime: 15_000,
  });

  const selectedIssue = useMemo(
    () => overview?.issues.find((entry) => entry.type === selectedType),
    [overview, selectedType]
  );

  const snapshotsQuery = useQuery({
    queryKey: ['library-health-snapshots'],
    queryFn: () => api.getHealthSnapshots(),
    staleTime: 60_000,
  });

  const ignoredQuery = useQuery({
    queryKey: ['library-health-ignored'],
    queryFn: () => api.getIgnoredHealthIssues(),
    enabled: ignoredOpen,
    staleTime: 10_000,
  });

  const deepScanQuery = useQuery({
    queryKey: ['library-health-deep-scan'],
    queryFn: () => api.getContentScanStatus(),
    refetchInterval: (query) => (query.state.data?.isRunning ? 1000 : false),
    staleTime: 0,
  });

  const invalidateHealth = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['library-health'] }),
      queryClient.invalidateQueries({ queryKey: ['library-health-issue'] }),
      queryClient.invalidateQueries({ queryKey: ['library-health-ignored'] }),
    ]);
  };

  const ignoreMutation = useMutation({
    mutationFn: (body: { type: HealthIssueType; signature: string; label?: string }) => api.ignoreHealthIssue(body),
    onSuccess: async () => {
      setActionError(null);
      setActionMessage('Issue hidden from diagnostics. No library files were touched.');
      setOffset(0);
      await invalidateHealth();
    },
    onError: (error: any) => setActionError(error?.message || 'Failed to ignore issue'),
  });

  const restoreMutation = useMutation({
    mutationFn: (body: { type?: HealthIssueType; signature?: string }) => api.unignoreHealthIssues(body),
    onSuccess: async (result) => {
      setActionError(null);
      setActionMessage(`Restored ${result.removed} ignored diagnostic${result.removed === 1 ? '' : 's'}.`);
      setOffset(0);
      await invalidateHealth();
    },
    onError: (error: any) => setActionError(error?.message || 'Failed to restore issues'),
  });

  const verifyMutation = useMutation({
    mutationFn: async (): Promise<VerifyLibraryFilesResult> => {
      const roots = overview?.roots ?? [];
      const targets = roots.length
        ? roots.map((root) => ({ id: root.id as string | undefined, name: root.name }))
        : [{ id: undefined as string | undefined, name: 'all library roots' }];
      const total = overview?.totals.tracks ?? 0;
      const result: VerifyLibraryFilesResult = {
        checked: 0,
        limit: VERIFY_PAGE_SIZE,
        offset: 0,
        limited: false,
        missingCount: 0,
        missing: [],
        roots,
        mutated: false,
      };

      for (const target of targets) {
        let offset = 0;
        while (true) {
          setVerifyProgress({ rootName: target.name, checked: result.checked, total });
          const page = await api.verifyLibraryFiles({
            rootId: target.id,
            limit: VERIFY_PAGE_SIZE,
            offset,
          });
          result.checked += page.checked;
          result.missingCount += page.missingCount;
          result.roots = page.roots;
          if (result.missing.length < VERIFY_MISSING_LIMIT) {
            result.missing.push(
              ...page.missing.slice(0, VERIFY_MISSING_LIMIT - result.missing.length)
            );
          }
          offset += page.checked;
          if (!page.limited || page.checked === 0) break;
        }
      }

      setVerifyProgress({ rootName: 'all library roots', checked: result.checked, total });
      return result;
    },
    onSuccess: (result) => {
      setActionError(null);
      setVerifyResult(result);
      setVerifyProgress(null);
    },
    onError: (error: any) => {
      setVerifyProgress(null);
      setActionError(error?.message || 'File verification failed');
    },
  });

  const artworkVerifyMutation = useMutation({
    mutationFn: async (): Promise<ArtworkIntegrityResult> => {
      const result: ArtworkIntegrityResult = {
        total: 0,
        checked: 0,
        limit: ARTWORK_VERIFY_PAGE_SIZE,
        offset: 0,
        limited: false,
        brokenCount: 0,
        broken: [],
        mutated: false,
      };
      let offset = 0;

      while (true) {
        setArtworkVerifyProgress({ checked: result.checked, total: result.total });
        const page = await api.verifyArtworkIntegrity({ limit: ARTWORK_VERIFY_PAGE_SIZE, offset });
        result.total = page.total;
        result.limit = page.limit;
        result.checked += page.checked;
        result.brokenCount += page.brokenCount;
        if (result.broken.length < 500) {
          result.broken.push(...page.broken.slice(0, 500 - result.broken.length));
        }
        setArtworkVerifyProgress({ checked: result.checked, total: page.total });
        offset += page.checked;
        if (!page.limited || page.checked === 0) break;
      }

      return result;
    },
    onSuccess: (result) => {
      setActionError(null);
      setArtworkVerifyResult(result);
      setArtworkVerifyProgress(null);
    },
    onError: (error: any) => {
      setArtworkVerifyProgress(null);
      setActionError(error?.message || 'Artwork verification failed');
    },
  });

  const snapshotMutation = useMutation({
    mutationFn: () => api.captureHealthSnapshot(),
    onSuccess: async (result) => {
      setActionError(null);
      setActionMessage(
        result.stored
          ? 'Health snapshot captured.'
          : 'No diagnostic changes since the last snapshot.'
      );
      await queryClient.invalidateQueries({ queryKey: ['library-health-snapshots'] });
    },
    onError: (error: any) => setActionError(error?.message || 'Failed to capture health snapshot'),
  });

  const startDeepScanMutation = useMutation({
    mutationFn: () => api.startContentScan(),
    onSuccess: (data) => {
      setActionError(null);
      queryClient.setQueryData(['library-health-deep-scan'], data);
    },
    onError: (error: any) => setActionError(error?.message || 'Failed to start deep scan'),
  });

  const cancelDeepScanMutation = useMutation({
    mutationFn: () => api.cancelContentScan(),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['library-health-deep-scan'] });
    },
    onError: (error: any) => setActionError(error?.message || 'Failed to cancel deep scan'),
  });

  const scanMutation = useMutation({
    mutationFn: (rootId: string) => api.triggerScan(rootId),
    onSuccess: async () => {
      setActionError(null);
      setActionMessage('Library rescan started. Diagnostics will refresh when it completes.');
      await queryClient.invalidateQueries({ queryKey: ['library-health'] });
    },
    onError: (error: any) => setActionError(error?.message || 'Failed to start rescan'),
  });

  const handleRefresh = async () => {
    setRefreshing(true);
    setActionError(null);
    setActionMessage(null);
    try {
      const fresh = await api.getLibraryHealth(true);
      queryClient.setQueryData(['library-health'], fresh);
      await queryClient.invalidateQueries({ queryKey: ['library-health-issue'] });
    } catch (error: any) {
      setActionError(error?.message || 'Failed to refresh library diagnostics');
    } finally {
      setRefreshing(false);
    }
  };

  const handleExport = async (format: 'json' | 'csv') => {
    if (!overview || exporting) return;
    setExportMenuOpen(false);
    setExporting(format);
    setActionError(null);

    try {
      const ignored = await api.getIgnoredHealthIssues();
      const report = await buildHealthReport(
        overview,
        (type, params) => api.getHealthIssueDetails(type, params),
        ignored.ignored
      );

      if (format === 'json') {
        downloadHealthReport(
          JSON.stringify(report, null, 2),
          healthReportFilename('json'),
          'application/json'
        );
      } else {
        downloadHealthReport(
          `\uFEFF${healthReportToCsv(report)}`,
          healthReportFilename('csv'),
          'text/csv'
        );
      }

      setActionMessage(
        `Exported ${report.diagnostics.length} diagnostics as ${format.toUpperCase()}. No library files were touched.`
      );
    } catch (error: any) {
      setActionError(error?.message || 'Failed to export diagnostics');
    } finally {
      setExporting(null);
    }
  };

  const handlePlay = (track: Track, queue?: Track[]) => {
    if (currentTrack?.id === track.id) {
      togglePlay();
      return;
    }
    playTrack(track, queue);
  };

  const handleNavigateAlbum = (albumId: string, title: string) => {
    setActiveSection('albums');
    selectAlbum(albumId, title);
    setViewMode('table');
  };

  const handleNavigateArtist = (artistId: string, name: string) => {
    selectArtist(artistId, name);
  };

  const handleSelectIssue = (type: HealthIssueType) => {
    setSelectedType(type);
    setOffset(0);
    setActionError(null);
    setActionMessage(null);
  };

  const totalIgnored = overview?.ignoredTotal ?? 0;
  const score = overview?.metadataHealth.healthScore ?? 0;
  const tone = scoreTone(score);
  const scanRunning = Boolean(overview?.scan?.isRunning);
  const issueCount = overview?.issues ?? [];
  const activeIssueCount = issueCount.filter((issue) => issue.count > 0).length;
  const verifyPercent =
    verifyProgress && verifyProgress.total > 0
      ? Math.min(100, Math.round((verifyProgress.checked / verifyProgress.total) * 100))
      : 0;

  const snapshots = snapshotsQuery.data?.snapshots ?? [];
  const lastSnapshot: HealthSnapshot | undefined = snapshots[snapshots.length - 1];
  const previousSnapshot: HealthSnapshot | undefined = snapshots[snapshots.length - 2];
  const scoreDelta =
    lastSnapshot && previousSnapshot ? lastSnapshot.score - previousSnapshot.score : null;
  const trendPoints = snapshots.slice(-16).map((snapshot) => snapshot.score);
  const issueDeltas = useMemo(() => {
    if (!lastSnapshot || !previousSnapshot) return [];
    const types = new Set([
      ...Object.keys(lastSnapshot.issues),
      ...Object.keys(previousSnapshot.issues),
    ]);
    return Array.from(types)
      .map((type) => ({
        type,
        delta: (lastSnapshot.issues[type] ?? 0) - (previousSnapshot.issues[type] ?? 0),
      }))
      .filter((entry) => entry.delta !== 0)
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
      .slice(0, 4);
  }, [lastSnapshot, previousSnapshot]);

  useEffect(() => {
    if (previousScanRunning.current && !scanRunning && overview?.scan?.finishedAt) {
      previousScanRunning.current = scanRunning;
      const timer = setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['library-health-snapshots'] });
      }, 4000);
      return () => clearTimeout(timer);
    }
    previousScanRunning.current = scanRunning;
  }, [scanRunning, overview?.scan?.finishedAt, queryClient]);

  useEffect(() => {
    if (!scanRunning) return;
    const interval = setInterval(() => {
      queryClient.invalidateQueries({ queryKey: ['library-health'] });
    }, 5000);
    return () => clearInterval(interval);
  }, [scanRunning, queryClient]);

  return (
    <div className="flex-1 flex flex-col h-full overflow-y-auto bg-charcoal-900 select-none p-4 sm:p-6 space-y-5">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-3 border-b border-charcoal-800">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-cyan-950/60 border border-cyan-800/60 flex items-center justify-center text-cyan-400 shadow-lg shadow-cyan-950/40">
            <ShieldCheck size={20} />
          </div>
          <div>
            <h1 className="text-lg font-bold text-zinc-100 flex items-center gap-2">
              <span>Library Health Center</span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-cyan-950 text-cyan-400 border border-cyan-800/60 font-normal">
                READ-ONLY
              </span>
            </h1>
            <p className="text-xs text-zinc-400 mt-0.5">
              Forensic diagnostics for duplicates, artwork, metadata and file availability. Source files are never modified.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {scanRunning && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-amber-950/40 border border-amber-900/60 text-[10.5px] font-mono text-amber-300">
              <Loader2 size={12} className="animate-spin" /> Scanning library…
            </span>
          )}
          {totalIgnored > 0 && canIgnore && (
            <button
              onClick={() => setIgnoredOpen(true)}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-charcoal-700 bg-charcoal-850 text-[10.5px] font-mono text-zinc-300 hover:bg-charcoal-800 transition"
              title="Review and restore ignored diagnostics individually"
            >
              <EyeOff size={12} /> Ignored ({totalIgnored.toLocaleString()})
            </button>
          )}
          <div className="relative">
            <button
              onClick={() => setExportMenuOpen((open) => !open)}
              disabled={!overview || Boolean(exporting)}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-charcoal-700 bg-charcoal-850 text-[10.5px] font-mono text-zinc-300 hover:bg-charcoal-800 transition disabled:opacity-50"
              title="Download the current diagnostics as a report"
            >
              {exporting ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
              Export
            </button>
            {exportMenuOpen && (
              <div className="absolute right-0 top-full mt-1 w-44 z-30 rounded-lg border border-charcoal-700 bg-charcoal-850 shadow-xl overflow-hidden">
                <button
                  onClick={() => handleExport('json')}
                  className="w-full flex items-center gap-2 px-3 py-2 text-[10.5px] font-mono text-zinc-300 hover:bg-charcoal-800 transition"
                >
                  <FileJson size={12} className="text-cyan-400" /> JSON report
                </button>
                <button
                  onClick={() => handleExport('csv')}
                  className="w-full flex items-center gap-2 px-3 py-2 text-[10.5px] font-mono text-zinc-300 hover:bg-charcoal-800 transition border-t border-charcoal-800"
                >
                  <FileSpreadsheet size={12} className="text-emerald-400" /> CSV report
                </button>
              </div>
            )}
          </div>
          <button
            onClick={() => verifyMutation.mutate()}
            disabled={verifyMutation.isPending}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-charcoal-700 bg-charcoal-850 text-[10.5px] font-mono text-zinc-300 hover:bg-charcoal-800 hover:border-cyan-800 transition disabled:opacity-50"
            title="Check every source file for existence on disk, page by page. Read-only."
          >
            {verifyMutation.isPending ? <Loader2 size={12} className="animate-spin" /> : <HardDrive size={12} />}
            Verify files
          </button>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-crimson-800 hover:bg-crimson-700 text-[10.5px] font-mono text-white font-semibold transition disabled:opacity-50"
          >
            <RefreshCw size={12} className={refreshing ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>
      </div>

      {/* Action feedback */}
      {actionError && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-950/40 border border-red-900/60 text-[11px] text-red-300">
          <AlertTriangle size={13} className="shrink-0" />
          <span className="flex-1">{actionError}</span>
          <button onClick={() => setActionError(null)} className="text-red-400 hover:text-red-200">
            <span className="sr-only">Dismiss</span>✕
          </button>
        </div>
      )}
      {actionMessage && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-950/40 border border-emerald-900/60 text-[11px] text-emerald-300">
          <CheckCircle2 size={13} className="shrink-0" />
          <span className="flex-1">{actionMessage}</span>
          <button onClick={() => setActionMessage(null)} className="text-emerald-400 hover:text-emerald-200">
            <span className="sr-only">Dismiss</span>✕
          </button>
        </div>
      )}

      {/* Full-library verification progress */}
      {verifyMutation.isPending && (
        <div className="flex flex-col gap-1.5 px-3 py-2.5 rounded-lg bg-charcoal-850 border border-charcoal-800">
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-zinc-300">
            <Loader2 size={13} className="animate-spin text-cyan-400 shrink-0" />
            <span className="font-mono">
              Verifying {verifyProgress?.rootName ?? 'library'} —{' '}
              {verifyProgress ? (
                <>
                  {(verifyProgress.checked ?? 0).toLocaleString()}
                  {verifyProgress.total > 0 ? ` / ${verifyProgress.total.toLocaleString()}` : ''} files
                  {verifyProgress.total > 0 ? ` (${verifyPercent}%)` : ''}
                </>
              ) : (
                'preparing…'
              )}
            </span>
          </div>
          <div className="h-1 rounded-full bg-charcoal-800 overflow-hidden">
            <div
              className="h-full bg-cyan-500 transition-all duration-300"
              style={{ width: `${verifyPercent}%` }}
            />
          </div>
          <span className="text-[9.5px] font-mono text-zinc-500">
            Read-only existence check. Large libraries can take a while.
          </span>
        </div>
      )}

      {/* Overview stats */}
      {overviewQuery.isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-24 rounded-xl bg-charcoal-850/60 border border-charcoal-800 animate-pulse" />
          ))}
        </div>
      ) : overviewQuery.isError ? (
        <div className="p-6 rounded-xl bg-red-950/30 border border-red-900/50 text-sm text-red-300 flex items-center gap-2">
          <AlertTriangle size={16} />
          <span>Unable to load library diagnostics. {(overviewQuery.error as any)?.message}</span>
        </div>
      ) : overview ? (
        <>
          <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1.25fr)_minmax(0,2fr)] gap-3">
            {/* Health score */}
            <div
              className="bg-charcoal-850/80 border border-charcoal-800 rounded-xl p-4 backdrop-blur-md flex items-center gap-4"
              title="Weighted score covering metadata completeness, artwork, availability, duplicates, split albums, artist variants and suspicious audio"
            >
              <div
                className="relative w-20 h-20 rounded-full shrink-0"
                style={{
                  background: `conic-gradient(${tone.ring} ${Math.max(0, Math.min(100, score)) * 3.6}deg, #27272a 0deg)`,
                }}
              >
                <div className="absolute inset-[6px] rounded-full bg-charcoal-900 flex flex-col items-center justify-center">
                  <span className={`text-xl font-bold font-mono ${tone.text}`}>{score}</span>
                  <span className="text-[8px] font-mono uppercase tracking-wider text-zinc-500">score</span>
                </div>
              </div>
              <div className="min-w-0">
                <div className={`text-sm font-bold ${tone.text}`}>{tone.label}</div>
                <div className="text-[10.5px] text-zinc-500 font-mono mt-0.5">
                  {activeIssueCount > 0
                    ? `${activeIssueCount} diagnostic${activeIssueCount === 1 ? '' : 's'} need attention`
                    : 'All diagnostics clear'}
                </div>
                <div className="text-[9.5px] text-zinc-600 font-mono mt-1">
                  Updated {new Date(overview.generatedAt).toLocaleString()}
                </div>
              </div>
            </div>

            {/* Library totals */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                {
                  label: 'Tracks',
                  value: overview.totals.tracks.toLocaleString(),
                  icon: <Music size={13} className="text-cyan-400" />,
                },
                {
                  label: 'Albums',
                  value: overview.totals.albums.toLocaleString(),
                  icon: <Disc size={13} className="text-purple-400" />,
                },
                {
                  label: 'Artists',
                  value: overview.totals.artists.toLocaleString(),
                  icon: <Mic2 size={13} className="text-emerald-400" />,
                },
                {
                  label: 'On disk',
                  value: formatBytes(Number(overview.totals.totalFileSizeBytes || 0)),
                  icon: <HardDrive size={13} className="text-amber-400" />,
                },
              ].map((stat) => (
                <div
                  key={stat.label}
                  className="bg-charcoal-850/80 border border-charcoal-800 rounded-xl p-3 flex flex-col justify-between min-h-[76px] hover:border-charcoal-700 transition"
                >
                  <div className="flex items-center justify-between text-zinc-400">
                    <span className="text-[9.5px] uppercase font-mono tracking-wider">{stat.label}</span>
                    {stat.icon}
                  </div>
                  <span className="text-lg font-bold font-mono text-zinc-100 truncate">{stat.value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Health trend */}
          <div className="bg-charcoal-850/80 border border-charcoal-800 rounded-xl p-3.5 backdrop-blur-md flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex items-center gap-2 shrink-0 sm:w-[180px]">
              <div className="w-8 h-8 rounded-lg bg-cyan-950/60 border border-cyan-900/60 flex items-center justify-center text-cyan-400">
                <History size={14} />
              </div>
              <div>
                <div className="text-[11px] font-semibold text-zinc-200">Health trend</div>
                <div className="text-[9px] font-mono text-zinc-500">
                  {snapshots.length > 0
                    ? `${snapshots.length} of ${snapshotsQuery.data?.max ?? 40} snapshots`
                    : 'No snapshots yet'}
                </div>
              </div>
            </div>

            {lastSnapshot ? (
              <div className="flex flex-wrap items-center gap-3 min-w-0">
                {trendPoints.length >= 2 && <Sparkline points={trendPoints} color={tone.ring} />}
                <div className="min-w-0">
                  <div className="flex items-baseline gap-2">
                    <span className={`text-lg font-bold font-mono ${tone.text}`}>{lastSnapshot.score}</span>
                    {scoreDelta !== null && (
                      <span
                        className={`inline-flex items-center gap-0.5 text-[10px] font-mono ${
                          scoreDelta >= 0 ? 'text-emerald-400' : 'text-red-400'
                        }`}
                      >
                        {scoreDelta >= 0 ? <ArrowUpRight size={11} /> : <ArrowDownRight size={11} />}
                        {scoreDelta > 0 ? '+' : ''}
                        {scoreDelta}
                      </span>
                    )}
                  </div>
                  <div className="text-[9px] font-mono text-zinc-500">
                    {new Date(lastSnapshot.capturedAt).toLocaleString()} ·{' '}
                    {lastSnapshot.reason === 'scan' ? 'after scan' : 'manual'}
                  </div>
                </div>
                {issueDeltas.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1">
                    {issueDeltas.map((entry) => {
                      const label =
                        overview.issues.find((issue) => issue.type === entry.type)?.label ?? entry.type;
                      const worse = entry.delta > 0;
                      return (
                        <span
                          key={entry.type}
                          className={`inline-flex items-center gap-0.5 text-[9px] font-mono px-1.5 py-0.5 rounded border ${
                            worse
                              ? 'bg-amber-950/40 text-amber-300 border-amber-900/50'
                              : 'bg-emerald-950/40 text-emerald-300 border-emerald-900/50'
                          }`}
                        >
                          {worse ? <ArrowUpRight size={10} /> : <ArrowDownRight size={10} />}
                          {label} {worse ? '+' : ''}
                          {entry.delta}
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : (
              <p className="flex-1 text-[10px] font-mono text-zinc-500">
                Snapshots are captured automatically after each library scan. They track score and diagnostic
                changes over time.
              </p>
            )}

            {canIgnore && (
              <button
                onClick={() => snapshotMutation.mutate()}
                disabled={snapshotMutation.isPending}
                className="ml-auto inline-flex items-center gap-1 px-2 py-1 rounded border border-charcoal-700 text-[10px] font-mono text-zinc-300 hover:bg-charcoal-800 hover:border-cyan-800 transition disabled:opacity-40 shrink-0"
                title="Store the current diagnostics as a trend point"
              >
                {snapshotMutation.isPending ? (
                  <Loader2 size={10} className="animate-spin" />
                ) : (
                  <History size={10} />
                )}
                Capture snapshot
              </button>
            )}
          </div>

          {/* Master / detail */}
          <div className="grid grid-cols-1 lg:grid-cols-[300px_minmax(0,1fr)] gap-4 items-start">
            <div className="bg-charcoal-850/90 border border-charcoal-800 rounded-xl overflow-hidden shadow-xl backdrop-blur-md">
              <div className="px-3.5 py-2.5 border-b border-charcoal-800 flex items-center justify-between">
                <div className="flex items-center gap-2 text-zinc-300">
                  <Activity size={14} className="text-cyan-400" />
                  <h2 className="text-xs font-bold uppercase tracking-wider font-mono">Diagnostics</h2>
                </div>
                <span className="text-[9.5px] font-mono text-zinc-500">
                  {activeIssueCount}/{issueCount.length} active
                </span>
              </div>
              <div className="p-2 space-y-1">
                {issueCount.map((issue) => {
                  const isSelected = issue.type === selectedType;
                  const hasIssues = issue.count > 0;
                  const styles = SEVERITY_STYLES[issue.severity];
                  return (
                    <button
                      key={issue.type}
                      onClick={() => handleSelectIssue(issue.type)}
                      className={`w-full text-left px-2.5 py-2 rounded-lg border transition ${
                        isSelected
                          ? 'bg-charcoal-800 border-charcoal-600'
                          : 'bg-transparent border-transparent hover:bg-charcoal-800/60 hover:border-charcoal-750'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className={hasIssues ? styles.text : 'text-zinc-600'}>
                          {ISSUE_ICONS[issue.type]}
                        </span>
                        <span className={`flex-1 text-[11.5px] font-medium truncate ${hasIssues ? 'text-zinc-200' : 'text-zinc-500'}`}>
                          {issue.label}
                        </span>
                        <span
                          className={`text-[10px] font-mono px-1.5 py-0.2 rounded border shrink-0 ${
                            hasIssues
                              ? styles.badge
                              : 'bg-charcoal-900 text-zinc-600 border-charcoal-800'
                          }`}
                        >
                          {issue.count.toLocaleString()}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mt-0.5 pl-[23px]">
                        <span className={`w-1 h-1 rounded-full shrink-0 ${hasIssues ? styles.dot : 'bg-zinc-700'}`} />
                        <span className="text-[9.5px] text-zinc-500 truncate">
                          {issue.count > 0
                            ? `${issue.count.toLocaleString()} ${primaryUnit(issue.type)}${
                                issue.secondaryCount > 0
                                  ? ` · ${issue.secondaryCount.toLocaleString()} ${secondaryUnit(issue.type)}`
                                  : ''
                              }`
                            : 'Clear'}
                          {issue.ignoredCount > 0 ? ` · ${issue.ignoredCount} ignored` : ''}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <HealthDetail
              type={selectedType}
              data={detailQuery.data}
              overview={overview}
              loading={selectedType !== 'roots' && detailQuery.isLoading}
              isLoading={detailQuery.isFetching}
              canIgnore={canIgnore}
              ignorePending={ignoreMutation.isPending}
              ignoredCount={selectedIssue?.ignoredCount ?? 0}
              scanRunning={scanRunning}
              currentTrackId={currentTrack?.id}
              isPlaying={isPlaying}
              onPlay={handlePlay}
              onIgnore={(type, signature, label) => ignoreMutation.mutate({ type, signature, label })}
              onRestoreType={(type) => restoreMutation.mutate({ type })}
              onRescanRoot={(rootId) => scanMutation.mutate(rootId)}
              onNavigateAlbum={handleNavigateAlbum}
              onNavigateArtist={handleNavigateArtist}
              onNextPage={() => setOffset((current) => current + PAGE_SIZE)}
              onPrevPage={() => setOffset((current) => Math.max(0, current - PAGE_SIZE))}
              artworkVerifyPending={artworkVerifyMutation.isPending}
              artworkVerifyProgress={artworkVerifyProgress}
              onVerifyArtwork={() => artworkVerifyMutation.mutate()}
              deepScan={deepScanQuery.data}
              deepScanLoading={startDeepScanMutation.isPending}
              onStartDeepScan={() => startDeepScanMutation.mutate()}
              onCancelDeepScan={() => cancelDeepScanMutation.mutate()}
            />
          </div>
        </>
      ) : null}

      {/* Disk verification results */}
      {verifyResult && (
        <div className="bg-charcoal-850/90 border border-charcoal-800 rounded-xl overflow-hidden shadow-xl backdrop-blur-md">
          <div className="p-3.5 border-b border-charcoal-800 flex items-center justify-between">
            <div className="flex items-center gap-2 text-zinc-200">
              <HardDrive size={15} className="text-cyan-400" />
              <h3 className="text-sm font-bold">Disk Verification</h3>
              <span
                className={`text-[9.5px] font-mono px-1.5 py-0.2 rounded border ${
                  verifyResult.missingCount > 0
                    ? 'bg-red-950/60 text-red-300 border-red-900/60'
                    : 'bg-emerald-950/60 text-emerald-300 border-emerald-900/60'
                }`}
              >
                {verifyResult.missingCount > 0
                  ? `${verifyResult.missingCount} missing`
                  : 'All checked files present'}
              </span>
            </div>
            <button
              onClick={() => setVerifyResult(null)}
              className="text-zinc-500 hover:text-zinc-200 text-xs font-mono px-2 py-1 rounded hover:bg-charcoal-800 transition"
            >
              Close
            </button>
          </div>
          <div className="p-3.5 space-y-2">
            <p className="text-[10.5px] text-zinc-500 font-mono">
              Checked {verifyResult.checked.toLocaleString()} files across{' '}
              {verifyResult.roots.length.toLocaleString()} root
              {verifyResult.roots.length === 1 ? '' : 's'}. No files were modified — this is an existence check
              only.
            </p>
            {verifyResult.missing.length > 0 && (
              <div className="rounded-lg border border-charcoal-800 overflow-hidden">
                <div className="divide-y divide-charcoal-800/60 max-h-64 overflow-y-auto">
                  {verifyResult.missing.slice(0, 20).map((file) => (
                    <div key={file.id} className="px-3 py-2">
                      <div className="text-[11px] text-zinc-200 truncate">
                        {file.artistName} — {file.title}
                      </div>
                      <div className="text-[9.5px] font-mono text-zinc-500 truncate">{file.fullPath}</div>
                    </div>
                  ))}
                </div>
                {verifyResult.missing.length > 20 && (
                  <div className="px-3 py-1.5 text-[9.5px] font-mono text-zinc-500 border-t border-charcoal-800">
                    Showing first 20 of {verifyResult.missingCount.toLocaleString()} missing files
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Artwork integrity results */}
      {artworkVerifyResult && (
        <div className="bg-charcoal-850/90 border border-charcoal-800 rounded-xl overflow-hidden shadow-xl backdrop-blur-md">
          <div className="p-3.5 border-b border-charcoal-800 flex items-center justify-between">
            <div className="flex items-center gap-2 text-zinc-200">
              <ImageOff size={15} className="text-cyan-400" />
              <h3 className="text-sm font-bold">Artwork Integrity</h3>
              <span
                className={`text-[9.5px] font-mono px-1.5 py-0.2 rounded border ${
                  artworkVerifyResult.brokenCount > 0
                    ? 'bg-red-950/60 text-red-300 border-red-900/60'
                    : 'bg-emerald-950/60 text-emerald-300 border-emerald-900/60'
                }`}
              >
                {artworkVerifyResult.brokenCount > 0
                  ? `${artworkVerifyResult.brokenCount} broken`
                  : 'All artwork readable'}
              </span>
            </div>
            <button
              onClick={() => setArtworkVerifyResult(null)}
              className="text-zinc-500 hover:text-zinc-200 text-xs font-mono px-2 py-1 rounded hover:bg-charcoal-800 transition"
            >
              Close
            </button>
          </div>
          <div className="p-3.5 space-y-2">
            <p className="text-[10.5px] text-zinc-500 font-mono">
              Checked {artworkVerifyResult.checked.toLocaleString()} of{' '}
              {artworkVerifyResult.total.toLocaleString()} album artwork records. Missing files fall back to track
              artwork and the unknown-cover image. Read-only.
            </p>
            {artworkVerifyResult.broken.length > 0 && (
              <div className="rounded-lg border border-charcoal-800 overflow-hidden">
                <div className="divide-y divide-charcoal-800/60 max-h-64 overflow-y-auto">
                  {artworkVerifyResult.broken.slice(0, 20).map((album) => (
                    <div key={`${album.albumId}:${album.artworkId}`} className="flex items-center gap-3 px-3 py-2">
                      <div className="min-w-0 flex-1">
                        <div className="text-[11px] text-zinc-200 truncate">
                          {album.artistName || 'Unknown Artist'} — {album.albumTitle}
                        </div>
                        <div className="text-[9.5px] font-mono text-zinc-500 truncate">
                          {album.reason} · {album.source} · {album.path || 'no source path'}
                        </div>
                      </div>
                      <button
                        onClick={() => handleNavigateAlbum(album.albumId, album.albumTitle)}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded border border-charcoal-700 text-[10px] font-mono text-zinc-300 hover:bg-charcoal-800 hover:border-cyan-800 transition shrink-0"
                      >
                        <Disc size={10} /> Open
                      </button>
                    </div>
                  ))}
                </div>
                {artworkVerifyResult.broken.length > 20 && (
                  <div className="px-3 py-1.5 text-[9.5px] font-mono text-zinc-500 border-t border-charcoal-800">
                    Showing first 20 of {artworkVerifyResult.brokenCount.toLocaleString()} broken artwork records
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Ignored diagnostics manager */}
      {ignoredOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
          onClick={() => setIgnoredOpen(false)}
        >
          <div
            className="w-full max-w-2xl max-h-[80vh] flex flex-col rounded-xl border border-charcoal-700 bg-charcoal-850 shadow-2xl overflow-hidden"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-charcoal-800">
              <div className="flex items-center gap-2">
                <EyeOff size={15} className="text-cyan-400" />
                <h3 className="text-sm font-bold text-zinc-100">Ignored diagnostics</h3>
                <span className="text-[9.5px] font-mono px-1.5 py-0.2 rounded bg-charcoal-800 border border-charcoal-700 text-zinc-400">
                  {(ignoredQuery.data?.total ?? totalIgnored).toLocaleString()}
                </span>
              </div>
              <button
                onClick={() => setIgnoredOpen(false)}
                className="text-zinc-500 hover:text-zinc-200 p-1 rounded hover:bg-charcoal-800 transition"
                title="Close"
              >
                <X size={14} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-charcoal-800/60">
              {ignoredQuery.isLoading ? (
                <div className="p-8 flex items-center justify-center gap-2 text-zinc-500 font-mono text-xs">
                  <Loader2 size={14} className="animate-spin" /> Loading ignored diagnostics…
                </div>
              ) : ignoredQuery.data && ignoredQuery.data.ignored.length > 0 ? (
                ignoredQuery.data.ignored.map((entry) => (
                  <div key={`${entry.type}:${entry.signature}`} className="flex items-center gap-3 px-4 py-2.5">
                    <span className="text-[8.5px] font-mono uppercase px-1.5 py-0.5 rounded bg-charcoal-800 border border-charcoal-700 text-zinc-400 shrink-0">
                      {entry.type.replace(/-/g, ' ')}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-[11px] text-zinc-200 truncate">
                        {entry.label || 'Untitled diagnostic'}
                      </div>
                      <div className="text-[9px] font-mono text-zinc-500 truncate">
                        {entry.signature} · {new Date(entry.ignoredAt).toLocaleString()}
                      </div>
                    </div>
                    <button
                      onClick={() => restoreMutation.mutate({ type: entry.type, signature: entry.signature })}
                      disabled={restoreMutation.isPending}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded border border-charcoal-700 text-[10px] font-mono text-zinc-300 hover:bg-charcoal-800 transition disabled:opacity-40 shrink-0"
                    >
                      <RotateCcw size={10} /> Restore
                    </button>
                  </div>
                ))
              ) : (
                <div className="p-8 text-center space-y-1">
                  <CheckCircle2 size={26} className="mx-auto text-emerald-500/80" />
                  <p className="text-xs text-zinc-300">No ignored diagnostics.</p>
                  <p className="text-[10px] font-mono text-zinc-500">
                    Hidden items will appear here so you can restore them individually.
                  </p>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-charcoal-800">
              <p className="text-[9.5px] font-mono text-zinc-500">
                Ignored items stay in your library; only their diagnostics are hidden. Files are never modified.
              </p>
              <button
                onClick={() => restoreMutation.mutate({})}
                disabled={
                  restoreMutation.isPending || !(ignoredQuery.data?.ignored.length ?? 0)
                }
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded border border-charcoal-700 text-[10px] font-mono text-zinc-300 hover:bg-charcoal-800 transition disabled:opacity-40 shrink-0"
              >
                {restoreMutation.isPending ? (
                  <Loader2 size={10} className="animate-spin" />
                ) : (
                  <RotateCcw size={10} />
                )}
                Restore all
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
