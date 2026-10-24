import React, { useRef, useState, useMemo } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useQueryClient } from '@tanstack/react-query';
import {
  Star,
  Play,
  Volume2,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Music,
  RefreshCw,
  LogIn,
  CheckCircle,
  Headphones,
} from 'lucide-react';
import { Track } from '../types';
import { usePlayerStore } from '../store/playerStore';
import { useUiStore } from '../store/uiStore';
import { useResponsive } from '../hooks/useResponsive';
import { api } from '../api/client';
import { ContextMenu } from './ContextMenu';
import { AlphabetBar } from './AlphabetBar';
import { offlineStorageService } from '../services/offlineStorageService';

interface TrackTableProps {
  tracks: Track[];
  isLoading?: boolean;
  isFetching?: boolean;
  hasMore?: boolean;
  isFetchingMore?: boolean;
  onLoadMore?: () => void;
  totalCount?: number;
}

function formatDuration(sec: number): string {
  if (!sec || isNaN(sec)) return '--:--';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

function formatCodecBadge(codec?: string | null, bitrate?: number | null, isLossless?: boolean): string {
  let name = (codec || 'MP3').toUpperCase();
  if (name.includes('MPEG') || name.includes('LAYER 3') || name === 'MP3') {
    name = 'MP3';
  } else if (name.includes('FLAC')) {
    name = 'FLAC';
  } else if (name.includes('ALAC') || name.includes('APPLE LOSSLESS')) {
    name = 'ALAC';
  } else if (name.includes('AAC')) {
    name = 'AAC';
  } else if (name.includes('VORBIS') || name.includes('OGG')) {
    name = 'OGG';
  } else if (name.includes('OPUS')) {
    name = 'OPUS';
  } else if (name.includes('WAV') || name.includes('PCM')) {
    name = 'WAV';
  }

  if (bitrate && !isLossless && bitrate > 0 && bitrate < 1000) {
    return `${name} ${bitrate}k`;
  }
  return name;
}

export const TrackTable: React.FC<TrackTableProps> = ({
  tracks,
  isLoading,
  isFetching,
  hasMore,
  isFetchingMore,
  onLoadMore,
  totalCount,
}) => {
  const parentRef = useRef<HTMLDivElement>(null);
  const { isMobile } = useResponsive();
  const { currentTrack, isPlaying, playTrack, addToQueue, playNext } = usePlayerStore();
  const {
    sortBy,
    sortOrder,
    setSorting,
    setRightPanelTab,
    toggleRightPanel,
    rightPanelOpen,
    currentUser,
    setAuthModalOpen,
    searchQuery,
    searchField,
    setSearchQuery,
    setViewMode,
    openTrackProperties,
    setHighlightedAlbumId,
    selectArtist,
    selectAlbum,
  } = useUiStore();

  const queryClient = useQueryClient();

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [lastSelectedIndex, setLastSelectedIndex] = useState<number | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; tracks: Track[] } | null>(null);
  const [selectedLetter, setSelectedLetter] = useState<string | null>(null);
  const [, setOfflineVersion] = useState(0);

  React.useEffect(() => {
    return offlineStorageService.subscribe(() => {
      setOfflineVersion((v) => v + 1);
    });
  }, []);

  // Alphabetical letter index map for rapid jumping
  const { availableLetters, letterIndexMap } = useMemo(() => {
    const letters = new Set<string>();
    const map = new Map<string, number>();

    tracks.forEach((track, idx) => {
      const fieldVal = sortBy === 'title' ? track.title : sortBy === 'albumTitle' ? track.albumTitle : track.artistName;
      const firstChar = (fieldVal || '').trim().charAt(0).toUpperCase();
      const char = /[A-Z]/.test(firstChar) ? firstChar : '#';

      letters.add(char);
      if (!map.has(char)) {
        map.set(char, idx);
      }
    });

    return { availableLetters: letters, letterIndexMap: map };
  }, [tracks, sortBy]);

  // Virtualizer for 60fps rendering of thousands of tracks
  const rowVirtualizer = useVirtualizer({
    count: tracks.length + (hasMore ? 1 : 0),
    getScrollElement: () => parentRef.current,
    estimateSize: () => (isMobile ? 44 : 32), // 44px on mobile (with subtitle), 32px compact on desktop
    overscan: 20,
  });

  // Auto-fetch the next page when the user approaches the end of the loaded set.
  // The ref prevents a failed request from looping endlessly.
  const autoLoadCountRef = useRef(-1);
  React.useEffect(() => {
    if (!hasMore || isFetchingMore || !onLoadMore) return;
    if (autoLoadCountRef.current === tracks.length) return;
    const virtualItems = rowVirtualizer.getVirtualItems();
    const last = virtualItems[virtualItems.length - 1];
    if (last && last.index >= tracks.length - 15) {
      autoLoadCountRef.current = tracks.length;
      onLoadMore();
    }
  }, [hasMore, isFetchingMore, onLoadMore, tracks.length, rowVirtualizer]);

  const handleJumpToLetter = (char: string) => {
    setSelectedLetter(char);
    const targetIdx = letterIndexMap.get(char);
    if (targetIdx !== undefined && rowVirtualizer) {
      rowVirtualizer.scrollToIndex(targetIdx, { align: 'start' });
    }
  };

  const handleRowClick = (track: Track, index: number, e: React.MouseEvent) => {
    if (e.ctrlKey || e.metaKey) {
      const next = new Set(selectedIds);
      if (next.has(track.id)) next.delete(track.id);
      else next.add(track.id);
      setSelectedIds(next);
      setLastSelectedIndex(index);
    } else if (e.shiftKey && lastSelectedIndex !== null) {
      const start = Math.min(lastSelectedIndex, index);
      const end = Math.max(lastSelectedIndex, index);
      const next = new Set<string>();
      for (let i = start; i <= end; i++) {
        if (tracks[i]) next.add(tracks[i].id);
      }
      setSelectedIds(next);
    } else {
      setSelectedIds(new Set([track.id]));
      setLastSelectedIndex(index);
    }
  };

  const handleRowContextMenu = (track: Track, index: number, e: React.MouseEvent) => {
    e.preventDefault();
    let currentSelected = Array.from(selectedIds).map(id => tracks.find(t => t.id === id)).filter(Boolean) as Track[];
    if (!selectedIds.has(track.id)) {
      setSelectedIds(new Set([track.id]));
      setLastSelectedIndex(index);
      currentSelected = [track];
    }
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      tracks: currentSelected.length > 0 ? currentSelected : [track],
    });
  };

  const handleToggleFavorite = async (track: Track) => {
    try {
      const res = await api.toggleFavorite(track.id);
      track.isFavorite = res.isFavorite;
    } catch {
      // ignore
    }
  };

  const handleSortClick = (field: string) => {
    if (sortBy === field) {
      setSorting(field, sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSorting(field, 'asc');
    }
  };

  const renderSortIcon = (field: string) => {
    if (sortBy !== field) return <ArrowUpDown size={11} className="opacity-30 group-hover:opacity-70 ml-1" />;
    return sortOrder === 'asc' ? (
      <ArrowUp size={11} className="text-crimson-400 ml-1" />
    ) : (
      <ArrowDown size={11} className="text-crimson-400 ml-1" />
    );
  };

  if (isLoading && tracks.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-zinc-500 space-y-2">
        <div className="w-8 h-8 border-2 border-crimson-600 border-t-transparent rounded-full animate-spin" />
        <span className="font-mono text-xs">Loading library tracks...</span>
      </div>
    );
  }

  if (tracks.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-zinc-500 p-6 text-center space-y-3">
        <Music size={36} className="text-zinc-700" />
        <div className="max-w-md space-y-2">
          <p className="text-zinc-300 font-medium text-sm">
            {searchQuery
              ? `No tracks found matching "${searchQuery}" in ${searchField === 'all' ? 'any field' : searchField}`
              : 'No tracks found'}
          </p>
          <p className="text-zinc-500 text-xs">
            {searchQuery
              ? 'Try modifying your search term or switching the search filter mode.'
              : !currentUser
              ? 'Please log in to load your library and start streaming.'
              : 'Scan your local music folders in Settings to populate your audio library.'}
          </p>
          <div className="pt-2 flex justify-center">
            {searchQuery ? (
              <button
                onClick={() => setSearchQuery('')}
                className="px-3 py-1.5 bg-crimson-800 hover:bg-crimson-700 text-white rounded text-xs font-medium transition shadow flex items-center space-x-1.5"
              >
                <span>Clear Search</span>
              </button>
            ) : !currentUser ? (
              <button
                onClick={() => setAuthModalOpen(true)}
                className="px-3 py-1.5 bg-crimson-800 hover:bg-crimson-700 text-white rounded text-xs font-medium transition shadow flex items-center space-x-1.5"
              >
                <LogIn size={13} />
                <span>Log In / Admin Setup</span>
              </button>
            ) : (
              <button
                onClick={() => api.triggerScan()}
                className="px-3 py-1.5 bg-crimson-800 hover:bg-crimson-700 text-white rounded text-xs font-medium transition shadow flex items-center space-x-1.5"
              >
                <RefreshCw size={13} />
                <span>Scan Library Now</span>
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full bg-charcoal-900 select-none overflow-hidden relative">
      {/* Background loading shimmer bar */}
      {isFetching && (
        <div className="absolute top-0 left-0 right-0 h-0.5 bg-crimson-950/60 overflow-hidden z-30 pointer-events-none">
          <div className="h-full bg-gradient-to-r from-crimson-600 via-crimson-400 to-crimson-600 animate-pulse w-full" />
        </div>
      )}

      {/* Alphabet mini-scroller for rapid navigation */}
      {availableLetters.size > 0 && (
        <AlphabetBar
          activeLetters={availableLetters}
          selectedLetter={selectedLetter}
          onSelectLetter={handleJumpToLetter}
        />
      )}

      {/* Table Header */}
      <div className="h-7 bg-charcoal-850 border-b border-charcoal-750 flex items-center text-[11px] font-mono text-zinc-400 font-medium px-2 shrink-0">
        <div className="w-7 sm:w-8 text-center shrink-0">#</div>
        <div className="w-7 sm:w-8 text-center shrink-0"><Star size={11} className="mx-auto" /></div>
        <div
          onClick={() => handleSortClick('title')}
          className="flex-1 min-w-[110px] flex items-center cursor-pointer hover:text-zinc-200 group px-2"
        >
          <span>Title</span>
          {renderSortIcon('title')}
        </div>
        <div
          onClick={() => handleSortClick('artistName')}
          className="w-36 md:w-44 hidden sm:flex items-center cursor-pointer hover:text-zinc-200 group px-2 shrink-0"
        >
          <span>Artist</span>
          {renderSortIcon('artistName')}
        </div>
        <div
          onClick={() => handleSortClick('albumTitle')}
          className="w-40 md:w-48 hidden md:flex items-center cursor-pointer hover:text-zinc-200 group px-2 shrink-0"
        >
          <span>Album</span>
          {renderSortIcon('albumTitle')}
        </div>
        <div
          onClick={() => handleSortClick('duration')}
          className="w-14 sm:w-16 text-right cursor-pointer hover:text-zinc-200 flex items-center justify-end group px-2 shrink-0"
        >
          <span>Time</span>
          {renderSortIcon('duration')}
        </div>
        <div
          onClick={() => handleSortClick('genre')}
          className="w-24 lg:w-28 hidden lg:flex items-center cursor-pointer hover:text-zinc-200 group px-2 shrink-0"
        >
          <span>Genre</span>
          {renderSortIcon('genre')}
        </div>
        <div className="w-20 hidden md:flex items-center justify-center px-1 shrink-0">
          <span>Quality</span>
        </div>
        <div
          onClick={() => handleSortClick('playCount')}
          className="w-14 text-right hidden sm:flex items-center justify-end cursor-pointer hover:text-zinc-200 group px-2 shrink-0"
        >
          <span>Plays</span>
          {renderSortIcon('playCount')}
        </div>
      </div>

      {/* Virtualized Table Body */}
      <div ref={parentRef} className="flex-1 overflow-y-auto overflow-x-hidden text-xs">
        <div
          style={{
            height: `${rowVirtualizer.getTotalSize()}px`,
            width: '100%',
            position: 'relative',
          }}
        >
          {rowVirtualizer.getVirtualItems().map((virtualRow) => {
            if (virtualRow.index >= tracks.length) {
              return (
                <div
                  key="track-table-load-more"
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: `${virtualRow.size}px`,
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                  className="flex items-center justify-center bg-charcoal-900 text-[11px] text-zinc-500"
                >
                  <button
                    onClick={onLoadMore}
                    disabled={isFetchingMore}
                    className="px-3 py-1 rounded border border-charcoal-700 bg-charcoal-850 hover:bg-charcoal-800 hover:text-zinc-200 disabled:opacity-60 transition"
                  >
                    {isFetchingMore
                      ? 'Loading more tracks...'
                      : `Load more${totalCount ? ` (${tracks.length} of ${totalCount})` : ''}`}
                  </button>
                </div>
              );
            }

            const track = tracks[virtualRow.index];
            const isCurrent = currentTrack?.id === track.id;
            const isSelected = selectedIds.has(track.id);

            return (
              <div
                key={track.id}
                data-index={virtualRow.index}
                onClick={(e) => handleRowClick(track, virtualRow.index, e)}
                onDoubleClick={() => playTrack(track, tracks)}
                onContextMenu={(e) => handleRowContextMenu(track, virtualRow.index, e)}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: `${virtualRow.size}px`,
                  transform: `translateY(${virtualRow.start}px)`,
                }}
                className={`flex items-center px-2 border-b border-charcoal-800/40 text-[11.5px] cursor-default transition-colors ${
                  isSelected
                    ? 'bg-crimson-950/70 text-zinc-100 font-medium'
                    : isCurrent
                    ? 'bg-charcoal-800/80 text-crimson-400 font-medium'
                    : virtualRow.index % 2 === 0
                    ? 'bg-charcoal-900 text-zinc-300 hover:bg-charcoal-850'
                    : 'bg-charcoal-900/60 text-zinc-300 hover:bg-charcoal-850'
                }`}
              >
                {/* Track Status or Index */}
                <div className="w-7 sm:w-8 text-center text-zinc-500 font-mono text-[10px] flex items-center justify-center shrink-0">
                  {isCurrent && isPlaying ? (
                    <div className="flex items-end justify-center space-x-[2px] h-3 w-3" title="Now Playing">
                      <span className="w-[2px] bg-crimson-500 rounded-xs animate-bounce" style={{ height: '70%', animationDuration: '0.6s' }} />
                      <span className="w-[2px] bg-crimson-400 rounded-xs animate-bounce" style={{ height: '100%', animationDuration: '0.4s' }} />
                      <span className="w-[2px] bg-crimson-600 rounded-xs animate-bounce" style={{ height: '50%', animationDuration: '0.7s' }} />
                    </div>
                  ) : isCurrent ? (
                    <Play size={10} className="text-crimson-500 fill-crimson-500" />
                  ) : (
                    track.trackNumber || virtualRow.index + 1
                  )}
                </div>

                {/* Favorite Toggle */}
                <div className="w-7 sm:w-8 flex items-center justify-center shrink-0">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleToggleFavorite(track);
                    }}
                    className="p-1 hover:scale-110 transition"
                  >
                    <Star
                      size={12}
                      className={track.isFavorite ? 'text-yellow-400 fill-yellow-400' : 'text-zinc-600 hover:text-zinc-400'}
                    />
                  </button>
                </div>

                {/* Title & Mobile Subtitle */}
                <div className="flex-1 min-w-[110px] truncate px-2 font-normal flex flex-col justify-center">
                  <div className="flex items-center space-x-1.5 truncate">
                    <span className={`truncate ${isCurrent ? 'text-crimson-400 font-medium' : 'text-zinc-100'}`}>
                      {track.title}
                    </span>
                    {offlineStorageService.isOffline(track.id) && (
                      <span title="Tersedia Offline (Cached)" className="inline-flex shrink-0">
                        <CheckCircle size={10} className="text-emerald-400" />
                      </span>
                    )}
                  </div>
                  <span className="sm:hidden text-[10px] text-zinc-500 truncate mt-0.5 flex items-center space-x-1">
                    <span className="truncate">{track.artistName} {track.albumTitle ? `• ${track.albumTitle}` : ''}</span>
                    {track.combinedPlayCount > 0 && (
                      <span className="text-emerald-400 font-mono flex items-center space-x-0.5 shrink-0" title={`${track.combinedPlayCount} plays`}>
                        <span>•</span>
                        <Headphones size={9} />
                        <span>{track.combinedPlayCount}</span>
                      </span>
                    )}
                  </span>
                </div>

                {/* Artist */}
                <div className="w-36 md:w-44 hidden sm:block truncate px-2 text-zinc-400 shrink-0">
                  <span
                    onClick={(e) => {
                      e.stopPropagation();
                      if (track.artistId) {
                        selectArtist(track.artistId, track.artistName);
                      }
                    }}
                    className="truncate hover:underline hover:text-zinc-200 cursor-pointer"
                    title={`View artist: ${track.artistName}`}
                  >
                    {track.artistName}
                  </span>
                </div>

                {/* Album */}
                <div className="w-40 md:w-48 hidden md:block truncate px-2 text-zinc-400 shrink-0">
                  <span
                    onClick={(e) => {
                      e.stopPropagation();
                      if (track.albumId) {
                        selectAlbum(track.albumId, track.albumTitle);
                      }
                    }}
                    className="truncate hover:underline hover:text-zinc-200 cursor-pointer"
                    title={`View album: ${track.albumTitle}`}
                  >
                    {track.albumTitle}
                  </span>
                </div>

                {/* Duration */}
                <div className="w-14 sm:w-16 text-right font-mono text-[10.5px] sm:text-[11px] text-zinc-400 px-2 shrink-0">
                  {formatDuration(track.duration)}
                </div>

                {/* Genre */}
                <div className="w-24 lg:w-28 hidden lg:block truncate px-2 text-zinc-500 text-[11px] shrink-0">
                  {track.genre || '-'}
                </div>

                {/* Quality Badge */}
                <div className="w-20 hidden md:flex items-center justify-center px-1 shrink-0">
                  <span
                    className={`font-mono text-[9px] px-1.5 py-0.5 rounded border whitespace-nowrap truncate max-w-full ${
                      track.isLossless
                        ? 'bg-amber-950/40 text-amber-400 border-amber-800/40 font-semibold'
                        : 'bg-charcoal-800 text-zinc-400 border-charcoal-700'
                    }`}
                  >
                    {formatCodecBadge(track.codec, track.bitrate, track.isLossless)}
                  </span>
                </div>

                {/* Play Count */}
                <div className="w-14 text-right font-mono text-[10.5px] text-zinc-500 hidden sm:flex items-center justify-end px-2 shrink-0">
                  {track.combinedPlayCount > 0 ? (
                    <span
                      className="text-emerald-400 font-mono font-medium flex items-center space-x-1"
                      title={`Total plays: ${track.combinedPlayCount} (Local: ${track.localPlayCount || 0}, Last.fm: ${track.importedPlayCount || 0})`}
                    >
                      <Headphones size={10} className="text-emerald-400/80" />
                      <span>{track.combinedPlayCount}</span>
                    </span>
                  ) : (
                    <span className="text-zinc-600">-</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Floating Right-Click Context Menu */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          selectedTracks={contextMenu.tracks}
          onClose={() => setContextMenu(null)}
          onPlay={(t) => playTrack(t, tracks)}
          onPlayNext={(ts) => playNext(ts)}
          onAddToQueue={(ts) => addToQueue(ts)}
          onToggleFavorite={handleToggleFavorite}
          onSetRating={async (track, rating) => {
            try {
              await api.setRating(track.id, rating);
              await queryClient.invalidateQueries({ queryKey: ['tracks'] });
            } catch {
              // ignore
            }
          }}
          onLocateAlbum={(t) => {
            if (t.albumId) {
              setSearchQuery('');
              setViewMode('albumGrid');
              setHighlightedAlbumId(t.albumId);
            }
          }}
          onOpenProperties={(t) => openTrackProperties(t)}
          onShowDetails={(t) => {
            if (!rightPanelOpen) toggleRightPanel();
            setRightPanelTab('details');
          }}
          onSyncLastFm={async (t) => {
            try {
              await api.syncTrackLastFm(t.id);
              await queryClient.invalidateQueries({ queryKey: ['tracks'] });
            } catch (err) {
              console.error('Failed to sync track with Last.fm:', err);
            }
          }}
        />
      )}
    </div>
  );
};
