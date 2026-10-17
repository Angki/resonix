import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  Play,
  Disc,
  ListMusic,
  ZoomIn,
  ZoomOut,
  Folder,
  ArrowUpDown,
  Search,
  X,
  Sparkles,
  SlidersHorizontal,
} from 'lucide-react';
import { Album, Track } from '../types';
import { useUiStore } from '../store/uiStore';
import { usePlayerStore } from '../store/playerStore';
import { api } from '../api/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlbumContextMenu } from './AlbumContextMenu';
import { AlbumTracksModal } from './AlbumTracksModal';
import { AlphabetBar } from './AlphabetBar';

interface AlbumCardProps {
  album: Album;
  isHighlighted?: boolean;
  onOpenModal: () => void;
  onSelectAlbum: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
}

const AlbumCard: React.FC<AlbumCardProps> = ({
  album,
  isHighlighted,
  onOpenModal,
  onContextMenu,
}) => {
  const playTrack = usePlayerStore((s) => s.playTrack);
  const {
    gridDensity,
    showGridTrackCount,
    showGridQualityBadge,
    showGridYear,
    showGridArtist,
  } = useUiStore();

  const artworkUrl = album.artworkId
    ? api.getArtworkUrl(album.artworkId, 256)
    : '/api/artwork/unknown';

  const handlePlayAll = (e: React.MouseEvent) => {
    e.stopPropagation();
    api.getTracks({ albumId: album.id, limit: 150 }).then((res) => {
      if (res.tracks.length > 0) {
        playTrack(res.tracks[0], res.tracks);
      }
    });
  };

  const isCompact = gridDensity === 'compact';
  const isMinimal = gridDensity === 'minimal';

  return (
    <div
      id={`album-card-${album.id}`}
      onContextMenu={(e) => {
        e.preventDefault();
        onContextMenu(e);
      }}
      className={`group transition-all duration-200 col-span-1 flex flex-col select-none rounded-lg ${
        isMinimal
          ? 'bg-transparent p-0'
          : isCompact
          ? 'bg-charcoal-850/90 border border-charcoal-800/90 hover:border-charcoal-700 hover:bg-charcoal-800 p-1.5'
          : 'bg-charcoal-850 border border-charcoal-800 hover:border-charcoal-700 hover:bg-charcoal-800/80 p-2.5'
      } ${
        isHighlighted
          ? 'ring-2 ring-crimson-500 border-crimson-500 bg-charcoal-800 shadow-xl shadow-crimson-900/50 scale-[1.02] animate-pulse z-10'
          : ''
      }`}
    >
      {/* Cover Art - Clicking opens tracklist modal popup */}
      <div
        onClick={onOpenModal}
        className={`relative rounded-md bg-charcoal-900 overflow-hidden cursor-pointer w-full aspect-square group/cover select-none shrink-0 shadow-sm transition-transform duration-200 ${
          isMinimal ? 'mb-1.5' : isCompact ? 'mb-1.5' : 'mb-2'
        }`}
        title="Click to view tracklist popup (Right-click for options)"
      >
        <img
          src={artworkUrl}
          alt={album.title}
          loading="lazy"
          decoding="async"
          className="w-full h-full object-cover group-hover/cover:scale-105 transition duration-300"
          onError={(e) => {
            const target = e.target as HTMLImageElement;
            target.onerror = null;
            target.src = '/api/artwork/unknown';
          }}
        />

        {/* Quality badge (Top-left, if enabled) */}
        {showGridQualityBadge && album.qualityBadge && (
          <div
            className={`absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded text-[9px] font-mono tracking-wider font-semibold flex items-center space-x-1 border shadow pointer-events-none backdrop-blur-xs ${
              album.qualityBadge === 'HI-RES'
                ? 'bg-amber-950/90 text-amber-300 border-amber-600/60 shadow-amber-950/50'
                : album.isLossless
                ? 'bg-cyan-950/90 text-cyan-300 border-cyan-600/60 shadow-cyan-950/50'
                : album.qualityBadge === '320K'
                ? 'bg-emerald-950/90 text-emerald-300 border-emerald-600/60 shadow-emerald-950/50'
                : 'bg-black/85 text-zinc-400 border-zinc-700/60 shadow-black/50'
            }`}
            title={`${album.qualityBadge}${album.maxBitDepth ? ` ${album.maxBitDepth}-bit` : ''}${album.maxSampleRate ? ` / ${Math.round(album.maxSampleRate / 1000)}kHz` : ''}`}
          >
            <span>{album.qualityBadge}</span>
          </div>
        )}

        {/* Track count badge (Top-right, if enabled) */}
        {showGridTrackCount && (
          <div className="absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded bg-black/85 text-[10px] font-mono text-zinc-300 flex items-center space-x-1 border border-black/50 shadow pointer-events-none">
            <Disc size={10} className="text-crimson-400" />
            <span>{album.trackCount}</span>
          </div>
        )}

        {/* Play All overlay button */}
        <button
          onClick={handlePlayAll}
          title="Play Album"
          className="absolute bottom-2 right-2 p-2 sm:p-2.5 rounded-full bg-crimson-700 hover:bg-crimson-600 text-white shadow-xl opacity-0 group-hover/cover:opacity-100 transition transform hover:scale-110 active:scale-95 z-10"
        >
          <Play size={13} className="fill-white translate-x-0.5" />
        </button>
      </div>

      {/* Title & Metadata */}
      <div className="flex-1 min-w-0 w-full flex flex-col justify-start">
        <div
          onClick={onOpenModal}
          className={`truncate font-medium text-zinc-200 hover:text-white cursor-pointer ${
            isCompact ? 'text-[11px] leading-snug' : 'text-xs'
          }`}
          title={album.title}
        >
          {album.title}
        </div>

        {showGridArtist && (
          <div
            className={`truncate text-zinc-400 mt-0.5 ${
              isCompact ? 'text-[10px]' : 'text-[11px]'
            }`}
            title={album.artistName}
          >
            {album.artistName}
          </div>
        )}

        {showGridYear && album.year && (
          <div className="text-zinc-500 font-mono text-[9px] mt-0.5">
            {album.year}
          </div>
        )}
      </div>
    </div>
  );
};

const MemoizedAlbumCard = React.memo(AlbumCard);

export const AlbumGrid: React.FC = () => {
  const {
    selectAlbum,
    setViewMode,
    selectedRootId,
    selectedRootName,
    searchQuery,
    searchField,
    setSearchQuery,
    albumSortBy,
    albumSortOrder,
    setAlbumSorting,
    albumQualityFilter,
    setAlbumQualityFilter,
    gridCoverSize,
    setGridCoverSize,
    gridDensity,
    setGridDensity,
    showGridTrackCount,
    setShowGridTrackCount,
    showGridQualityBadge,
    setShowGridQualityBadge,
    showGridYear,
    setShowGridYear,
    showGridArtist,
    setShowGridArtist,
    highlightedAlbumId,
    setHighlightedAlbumId,
  } = useUiStore();

  const queryClient = useQueryClient();
  const [showGridOptions, setShowGridOptions] = useState(false);
  const [modalAlbum, setModalAlbum] = useState<Album | null>(null);
  const [albumContextMenu, setAlbumContextMenu] = useState<{
    x: number;
    y: number;
    album: Album;
  } | null>(null);

  const parentRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState<number>(() => {
    if (typeof window !== 'undefined') {
      return Math.max(300, window.innerWidth - 300);
    }
    return 1000;
  });

  // Wire search query & album sorting & Quality filter
  const { data: albums, isLoading, isFetching } = useQuery({
    queryKey: ['albums', selectedRootId, searchQuery, searchField, albumSortBy, albumSortOrder, albumQualityFilter],
    queryFn: () =>
      api.getAlbums({
        rootId: selectedRootId || undefined,
        search: searchQuery || undefined,
        searchField: searchField !== 'all' ? searchField : undefined,
        sortBy: albumSortBy || undefined,
        sortOrder: albumSortOrder || undefined,
        quality: albumQualityFilter !== 'all' ? albumQualityFilter : undefined,
      }),
    placeholderData: (previousData) => previousData,
    staleTime: 1000 * 60 * 2,
  });

  // Track parent width for virtualizer responsive layout
  useEffect(() => {
    const el = parentRef.current;
    if (!el) return;

    setContainerWidth(el.clientWidth);

    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.contentRect.width > 0) {
          setContainerWidth(entry.contentRect.width);
        }
      }
    });

    ro.observe(el);
    return () => ro.disconnect();
  }, [isLoading]);

  const handleWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey) {
      e.preventDefault();
      const delta = e.deltaY < 0 ? 15 : -15;
      setGridCoverSize(gridCoverSize + delta);
    }
  };

  const handleSortChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    const [by, order] = val.split(':');
    setAlbumSorting(by, (order as 'asc' | 'desc') || 'asc');
  };

  // Virtualizer grid column & row calculation
  const isCompact = gridDensity === 'compact';
  const isMinimal = gridDensity === 'minimal';
  const horizontalPadding = containerWidth < 640 ? 16 : 24;
  const gap = isCompact
    ? (containerWidth < 640 ? 8 : 10)
    : isMinimal
    ? (containerWidth < 640 ? 10 : 12)
    : (containerWidth < 640 ? 12 : 16);
  const usableWidth = Math.max(120, containerWidth - horizontalPadding);
  const columnCount = Math.max(1, Math.floor((usableWidth + gap) / (gridCoverSize + gap)));

  // Partition albums into virtual rows
  const rows = useMemo(() => {
    if (!albums || albums.length === 0) return [];
    const res: Album[][] = [];
    for (let i = 0; i < albums.length; i += columnCount) {
      res.push(albums.slice(i, i + columnCount));
    }
    return res;
  }, [albums, columnCount]);

  const metadataExtra = isCompact ? 44 : isMinimal ? 40 : 58;
  const estimatedRowHeight = Math.round(usableWidth / columnCount + metadataExtra);

  const [selectedLetter, setSelectedLetter] = useState<string | null>(null);

  const { availableLetters, letterRowMap } = useMemo(() => {
    const letters = new Set<string>();
    const map = new Map<string, number>();
    if (!albums || albums.length === 0) return { availableLetters: letters, letterRowMap: map };

    albums.forEach((album, idx) => {
      const fieldVal = albumSortBy === 'title' ? album.title : (album.artistName || album.title);
      const firstChar = (fieldVal || '').trim().charAt(0).toUpperCase();
      const char = /[A-Z]/.test(firstChar) ? firstChar : '#';

      letters.add(char);
      if (!map.has(char)) {
        const rowIndex = Math.floor(idx / columnCount);
        map.set(char, rowIndex);
      }
    });

    return { availableLetters: letters, letterRowMap: map };
  }, [albums, albumSortBy, columnCount]);

  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => estimatedRowHeight,
    getItemKey: (index) => `${columnCount}-${index}`,
    overscan: 4,
  });

  // Auto-scroll and focus to highlighted album when triggered from PlayerBar or elsewhere
  useEffect(() => {
    if (!highlightedAlbumId || !albums || albums.length === 0) return;
    const idx = albums.findIndex((a) => a.id === highlightedAlbumId);
    if (idx !== -1) {
      const rowIndex = Math.floor(idx / columnCount);
      rowVirtualizer.scrollToIndex(rowIndex, { align: 'center', behavior: 'smooth' });

      // Keep glowing pulse visible, then reset highlight after 3.5s
      const timer = setTimeout(() => {
        setHighlightedAlbumId(null);
      }, 3500);
      return () => clearTimeout(timer);
    }
  }, [highlightedAlbumId, albums, columnCount]);

  const handleJumpToLetter = (char: string) => {
    setSelectedLetter(char);
    const targetRow = letterRowMap.get(char);
    if (targetRow !== undefined && rowVirtualizer) {
      rowVirtualizer.scrollToIndex(targetRow, { align: 'start' });
    }
  };

  const handleOpenAlbumModal = useCallback((album: Album) => {
    setModalAlbum(album);
  }, []);

  const handleSelectAlbum = useCallback(
    (album: Album) => {
      selectAlbum(album.id, album.title);
      setViewMode('table');
    },
    [selectAlbum, setViewMode]
  );

  const handleCardContextMenu = useCallback((album: Album, e: React.MouseEvent) => {
    setAlbumContextMenu({
      x: e.clientX,
      y: e.clientY,
      album,
    });
  }, []);

  if (isLoading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-zinc-500 space-y-2">
        <div className="w-8 h-8 border-2 border-crimson-600 border-t-transparent rounded-full animate-spin" />
        <span className="font-mono text-xs">Loading albums...</span>
      </div>
    );
  }

  const currentSortValue = `${albumSortBy || 'albumArtist'}:${albumSortOrder || 'asc'}`;

  return (
    <div
      onWheel={handleWheel}
      className="flex-1 flex flex-col h-full overflow-hidden bg-charcoal-900 select-none relative"
    >
      {/* Background loading shimmer bar */}
      {isFetching && (
        <div className="absolute top-0 left-0 right-0 h-0.5 bg-crimson-950/60 overflow-hidden z-30 pointer-events-none">
          <div className="h-full bg-gradient-to-r from-crimson-600 via-crimson-400 to-crimson-600 animate-pulse w-full" />
        </div>
      )}
      {/* Grid Sub-header: Collection context, Album Sorting & Zoom Slider */}
      <div className="px-3 sm:px-4 py-2 bg-charcoal-950/80 border-b border-charcoal-800 flex items-center justify-between gap-2 shrink-0 text-xs flex-wrap sm:flex-nowrap">
        {/* Left: Active collection context & search badge */}
        <div className="flex items-center space-x-2 truncate min-w-0">
          <Folder size={14} className="text-crimson-500 shrink-0" />
          <span className="font-medium text-zinc-200 truncate">
            {selectedRootName || 'All Collections'}
          </span>
          {albums && (
            <span className="font-mono text-[10px] text-zinc-500 bg-charcoal-850 px-1.5 py-0.5 rounded border border-charcoal-800 shrink-0">
              {albums.length} albums
            </span>
          )}
          {searchQuery && (
            <div className="flex items-center space-x-1.5 bg-crimson-950/80 border border-crimson-800 text-crimson-300 px-2 py-0.5 rounded text-[11px] shrink-0">
              <Search size={10} />
              {searchField !== 'all' && (
                <span className="font-mono uppercase text-[9px] text-crimson-400 font-semibold bg-crimson-900/40 px-1 rounded">
                  {searchField}
                </span>
              )}
              <span>&ldquo;{searchQuery}&rdquo;</span>
              <button
                onClick={() => setSearchQuery('')}
                className="hover:text-white ml-0.5"
                title="Clear Search"
              >
                <X size={11} />
              </button>
            </div>
          )}
        </div>

        {/* Right: Quality Filter, Album Sorting selector & Grid Size Slider */}
        <div className="flex items-center space-x-2 shrink-0 ml-auto flex-wrap sm:flex-nowrap gap-y-1">
          {/* Quality Filter Dropdown */}
          <div className="flex items-center space-x-1 bg-charcoal-850/80 px-2 py-1 rounded border border-charcoal-800/80 text-[11px]">
            <Sparkles size={11} className="text-amber-400 shrink-0" />
            <select
              value={albumQualityFilter}
              onChange={(e) => setAlbumQualityFilter(e.target.value)}
              title="Filter by Quality"
              className="bg-transparent text-zinc-300 focus:outline-none cursor-pointer pr-1"
            >
              <option value="all" className="bg-charcoal-900 text-zinc-200">
                All Qualities
              </option>
              <option value="hires" className="bg-charcoal-900 text-amber-300">
                ★ Hi-Res Audio (24-bit / 96kHz+)
              </option>
              <option value="lossless" className="bg-charcoal-900 text-cyan-300">
                Lossless (FLAC / ALAC / WAV)
              </option>
              <option value="320k" className="bg-charcoal-900 text-emerald-300">
                320 kbps (High Quality)
              </option>
              <option value="standard" className="bg-charcoal-900 text-zinc-300">
                Standard / VBR
              </option>
            </select>
          </div>

          {/* Sorting Dropdown (Classic style) */}
          <div className="flex items-center space-x-1 bg-charcoal-850/80 px-2 py-1 rounded border border-charcoal-800/80 text-[11px]">
            <ArrowUpDown size={11} className="text-zinc-500 shrink-0" />
            <select
              value={currentSortValue}
              onChange={handleSortChange}
              title="Album Sorting Options"
              className="bg-transparent text-zinc-300 focus:outline-none cursor-pointer pr-1"
            >
              <option value="albumArtist:asc" className="bg-charcoal-900 text-zinc-200">
                Artist → Year → Album (Classic)
              </option>
              <option value="quality:desc" className="bg-charcoal-900 text-zinc-200">
                Audio Quality (Hi-Res → Standard)
              </option>
              <option value="title:asc" className="bg-charcoal-900 text-zinc-200">
                Album Title (A - Z)
              </option>
              <option value="title:desc" className="bg-charcoal-900 text-zinc-200">
                Album Title (Z - A)
              </option>
              <option value="artist:asc" className="bg-charcoal-900 text-zinc-200">
                Artist Name (A - Z)
              </option>
              <option value="year:desc" className="bg-charcoal-900 text-zinc-200">
                Year (Newest)
              </option>
              <option value="year:asc" className="bg-charcoal-900 text-zinc-200">
                Year (Oldest)
              </option>
              <option value="recent:desc" className="bg-charcoal-900 text-zinc-200">
                Recently Added
              </option>
              <option value="trackCount:desc" className="bg-charcoal-900 text-zinc-200">
                Most Tracks
              </option>
            </select>
          </div>

          {/* Grid Size Zoom Control (Ergonomic style) */}
          <div className="flex items-center space-x-1.5 shrink-0 bg-charcoal-850/80 px-2 py-1 rounded border border-charcoal-800/80">
            <button
              onClick={() => setGridCoverSize(gridCoverSize - 20)}
              title="Smaller Covers (Ctrl + Scroll Down)"
              className="p-0.5 text-zinc-400 hover:text-zinc-200 transition active:scale-95"
            >
              <ZoomOut size={13} />
            </button>

            <input
              type="range"
              min={110}
              max={300}
              step={10}
              value={gridCoverSize}
              onChange={(e) => setGridCoverSize(Number(e.target.value))}
              title={`Cover Size: ${gridCoverSize}px (Ctrl + Mouse Wheel)`}
              className="w-14 sm:w-20 h-1 bg-charcoal-750 accent-crimson-600 rounded cursor-pointer"
            />

            <button
              onClick={() => setGridCoverSize(gridCoverSize + 20)}
              title="Larger Covers (Ctrl + Scroll Up)"
              className="p-0.5 text-zinc-400 hover:text-zinc-200 transition active:scale-95"
            >
              <ZoomIn size={13} />
            </button>

            <span className="font-mono text-[10px] text-zinc-500 w-9 text-right hidden sm:inline">
              {gridCoverSize}px
            </span>
          </div>

          {/* Grid View Settings Popover */}
          <div className="relative">
            <button
              onClick={() => setShowGridOptions(!showGridOptions)}
              className={`flex items-center space-x-1.5 px-2 py-1 rounded border text-[11px] transition ${
                showGridOptions
                  ? 'bg-crimson-900/50 border-crimson-600 text-white font-medium shadow-xs'
                  : 'bg-charcoal-850/80 border-charcoal-800/80 text-zinc-300 hover:text-white hover:bg-charcoal-800'
              }`}
              title="Grid Display Variations & Settings"
            >
              <SlidersHorizontal size={12} className={showGridOptions ? 'text-crimson-400' : 'text-zinc-400'} />
              <span className="hidden sm:inline">Tampilan Grid</span>
            </button>

            {showGridOptions && (
              <>
                {/* Backdrop to close on click outside */}
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setShowGridOptions(false)}
                />

                <div className="absolute right-0 top-full mt-1.5 w-64 bg-charcoal-900 border border-charcoal-700 rounded-lg p-3 shadow-2xl backdrop-blur-xl z-50 text-xs space-y-3">
                  {/* Density (Rapat, Nyaman, Minimal) */}
                  <div>
                    <div className="text-[10px] font-mono uppercase text-zinc-400 tracking-wider mb-1.5 font-semibold">
                      Kerapatan (Density)
                    </div>
                    <div className="grid grid-cols-3 gap-1 bg-charcoal-950 p-1 rounded border border-charcoal-800 text-[11px]">
                      <button
                        onClick={() => setGridDensity('compact')}
                        className={`py-1 rounded font-medium transition ${
                          gridDensity === 'compact'
                            ? 'bg-crimson-700 text-white shadow-xs'
                            : 'text-zinc-400 hover:text-zinc-200'
                        }`}
                      >
                        Rapat
                      </button>
                      <button
                        onClick={() => setGridDensity('comfortable')}
                        className={`py-1 rounded font-medium transition ${
                          gridDensity === 'comfortable'
                            ? 'bg-crimson-700 text-white shadow-xs'
                            : 'text-zinc-400 hover:text-zinc-200'
                        }`}
                      >
                        Nyaman
                      </button>
                      <button
                        onClick={() => setGridDensity('minimal')}
                        className={`py-1 rounded font-medium transition ${
                          gridDensity === 'minimal'
                            ? 'bg-crimson-700 text-white shadow-xs'
                            : 'text-zinc-400 hover:text-zinc-200'
                        }`}
                      >
                        Minimal
                      </button>
                    </div>
                  </div>

                  {/* Metadata Toggles */}
                  <div className="space-y-1 pt-2 border-t border-charcoal-800">
                    <div className="text-[10px] font-mono uppercase text-zinc-400 tracking-wider mb-1 font-semibold">
                      Tampilkan Detail
                    </div>

                    <label className="flex items-center justify-between cursor-pointer py-1 px-1.5 rounded hover:bg-charcoal-800/60 transition">
                      <span className="text-zinc-300 text-[11px]">Badge Kualitas (FLAC/Hi-Res)</span>
                      <input
                        type="checkbox"
                        checked={showGridQualityBadge}
                        onChange={(e) => setShowGridQualityBadge(e.target.checked)}
                        className="rounded accent-crimson-600 cursor-pointer"
                      />
                    </label>

                    <label className="flex items-center justify-between cursor-pointer py-1 px-1.5 rounded hover:bg-charcoal-800/60 transition">
                      <span className="text-zinc-300 text-[11px]">Jumlah Tracks</span>
                      <input
                        type="checkbox"
                        checked={showGridTrackCount}
                        onChange={(e) => setShowGridTrackCount(e.target.checked)}
                        className="rounded accent-crimson-600 cursor-pointer"
                      />
                    </label>

                    <label className="flex items-center justify-between cursor-pointer py-1 px-1.5 rounded hover:bg-charcoal-800/60 transition">
                      <span className="text-zinc-300 text-[11px]">Nama Artis</span>
                      <input
                        type="checkbox"
                        checked={showGridArtist}
                        onChange={(e) => setShowGridArtist(e.target.checked)}
                        className="rounded accent-crimson-600 cursor-pointer"
                      />
                    </label>

                    <label className="flex items-center justify-between cursor-pointer py-1 px-1.5 rounded hover:bg-charcoal-800/60 transition">
                      <span className="text-zinc-300 text-[11px]">Tahun Rilis</span>
                      <input
                        type="checkbox"
                        checked={showGridYear}
                        onChange={(e) => setShowGridYear(e.target.checked)}
                        className="rounded accent-crimson-600 cursor-pointer"
                      />
                    </label>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Alphabet mini-scroller for rapid album navigation */}
      {availableLetters.size > 0 && (
        <AlphabetBar
          activeLetters={availableLetters}
          selectedLetter={selectedLetter}
          onSelectLetter={handleJumpToLetter}
        />
      )}

      {/* Grid Content - Virtualized 60FPS Container with Fixed Height Cards */}
      <div
        ref={parentRef}
        className="flex-1 overflow-y-auto p-3 sm:p-4 overscroll-contain"
      >
        {!albums || albums.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-zinc-500 p-6 text-center space-y-3">
            <Disc size={36} className="text-zinc-700" />
            <p className="text-zinc-300 font-medium text-sm">
              {searchQuery ? `No albums found matching "${searchQuery}"` : 'No albums available in this collection'}
            </p>
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="px-3 py-1 bg-charcoal-800 hover:bg-charcoal-700 text-zinc-200 rounded text-xs transition"
              >
                Clear Search
              </button>
            )}
          </div>
        ) : (
          <div
            style={{
              height: `${rowVirtualizer.getTotalSize()}px`,
              width: '100%',
              position: 'relative',
            }}
          >
            {rowVirtualizer.getVirtualItems().map((virtualRow) => {
              const rowAlbums = rows[virtualRow.index];
              if (!rowAlbums) return null;

              return (
                <div
                  key={virtualRow.key}
                  data-index={virtualRow.index}
                  ref={rowVirtualizer.measureElement}
                  className="absolute top-0 left-0 w-full"
                  style={{
                    transform: `translateY(${virtualRow.start}px)`,
                    paddingBottom: `${gap}px`,
                  }}
                >
                  <div
                    className={`grid items-start ${
                      isCompact ? 'gap-2 sm:gap-2.5' : isMinimal ? 'gap-2.5 sm:gap-3.5' : 'gap-3 sm:gap-4'
                    }`}
                    style={{
                      gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))`,
                    }}
                  >
                    {rowAlbums.map((album) => (
                      <MemoizedAlbumCard
                        key={album.id}
                        album={album}
                        isHighlighted={album.id === highlightedAlbumId}
                        onOpenModal={() => handleOpenAlbumModal(album)}
                        onSelectAlbum={() => handleSelectAlbum(album)}
                        onContextMenu={(e) => handleCardContextMenu(album, e)}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Context Menu: Album Card */}
      {albumContextMenu && (
        <AlbumContextMenu
          x={albumContextMenu.x}
          y={albumContextMenu.y}
          album={albumContextMenu.album}
          onViewTracks={() => {
            setModalAlbum(albumContextMenu.album);
          }}
          onSyncLastFm={async (album) => {
            try {
              await api.syncAlbumLastFm(album.id);
              await queryClient.invalidateQueries({ queryKey: ['albumTracksModal', album.id] });
              await queryClient.invalidateQueries({ queryKey: ['tracks'] });
            } catch (e) {
              console.error('Failed to sync album with Last.fm:', e);
            }
          }}
          onClose={() => setAlbumContextMenu(null)}
        />
      )}

      {/* Modal Popup: Album Tracklist */}
      <AlbumTracksModal
        album={modalAlbum}
        isOpen={!!modalAlbum}
        onClose={() => setModalAlbum(null)}
      />
    </div>
  );
};
