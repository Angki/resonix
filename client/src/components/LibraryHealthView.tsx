import React, { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Copy,
  Disc,
  EyeOff,
  FileWarning,
  Folder,
  FolderX,
  HardDrive,
  ImageOff,
  Layers,
  Loader2,
  Mic2,
  Music,
  Pause,
  Play,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Tags,
  Users,
} from 'lucide-react';
import { api } from '../api/client';
import { usePlayerStore } from '../store/playerStore';
import { useUiStore } from '../store/uiStore';
import {
  HealthArtworkDetail,
  HealthDuplicateArtistGroup,
  HealthDuplicateArtistsDetail,
  HealthDuplicateGroup,
  HealthDuplicatesDetail,
  HealthIssueDetail,
  HealthIssueType,
  HealthMetadataGapsDetail,
  HealthSeverity,
  HealthSplitAlbumsDetail,
  HealthSplitGroup,
  HealthSuspiciousDetail,
  HealthUnavailableDetail,
  LibraryHealthOverview,
  Track,
  VerifyLibraryFilesResult,
} from '../types';

const PAGE_SIZE = 25;
const VERIFY_PAGE_SIZE = 25000;
const VERIFY_MISSING_LIMIT = 500;

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
}) => {
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
      if (!detail || detail.albums.length === 0) return <EmptyState label="Every album has cover artwork." />;
      return (
        <div>
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
        </div>
      );
    }

    if (type === 'duplicates') {
      const detail = data as HealthDuplicatesDetail | undefined;
      if (!detail || detail.groups.length === 0) return <EmptyState label="No duplicate tracks detected." />;
      return (
        <div>
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

  const invalidateHealth = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['library-health'] }),
      queryClient.invalidateQueries({ queryKey: ['library-health-issue'] }),
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
    mutationFn: (body: { type?: HealthIssueType }) => api.unignoreHealthIssues(body),
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
              onClick={() => restoreMutation.mutate({})}
              disabled={restoreMutation.isPending}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-charcoal-700 bg-charcoal-850 text-[10.5px] font-mono text-zinc-300 hover:bg-charcoal-800 transition disabled:opacity-50"
            >
              <RotateCcw size={12} /> Restore all ({totalIgnored})
            </button>
          )}
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
    </div>
  );
};
