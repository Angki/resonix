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
} from 'lucide-react';
import { Album, Track } from '../types';
import { useUiStore } from '../store/uiStore';
import { usePlayerStore } from '../store/playerStore';
import { api } from '../api/client';
import { useQuery } from '@tanstack/react-query';
import { AlbumContextMenu } from './AlbumContextMenu';
import { AlbumTracksModal } from './AlbumTracksModal';
import { AlphabetBar } from './AlphabetBar';

interface AlbumCardProps {
  album: Album;
  onOpenModal: () => void;
  onSelectAlbum: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
}

const AlbumCard: React.FC<AlbumCardProps> = ({
  album,
  onOpenModal,
  onContextMenu,
}) => {
  const playTrack = usePlayerStore((s) => s.playTrack);

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

  return (
    <div
      onContextMenu={(e) => {
        e.preventDefault();
        onContextMenu(e);
      }}
      className="group bg-charcoal-850 border border-charcoal-800 hover:border-charcoal-700 hover:bg-charcoal-800/80 rounded-md p-2.5 transition-colors duration-150 col-span-1 flex flex-col select-none"
    >
      {/* Cover Art - Clicking opens tracklist modal popup */}
      <div
        onClick={onOpenModal}
        className="relative rounded bg-charcoal-900 overflow-hidden cursor-pointer w-full aspect-square mb-2 group/cover select-none shrink-0"
        title="Click to view tracklist popup (Right-click for options)"
      >
        <img
          src={artworkUrl}
          alt={album.title}
          loading="lazy"
          decoding="async"
          className="w-full h-full object-cover group-hover/cover:scale-105 transition duration-200"
          onError={(e) => {
            const target = e.target as HTMLImageElement;
            target.onerror = null;
            target.src = '/api/artwork/unknown';
          }}
        />

        {/* Track count badge (Solid crisp badge without expensive GPU blur filter) */}
        <div className="absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded bg-black/85 text-[10px] font-mono text-zinc-300 flex items-center space-x-1 border border-black/50 shadow pointer-events-none">
          <Disc size={10} className="text-crimson-400" />
          <span>{album.trackCount}</span>
        </div>

        {/* Hover overlay hint */}
        <div className="absolute inset-0 bg-black/45 opacity-0 group-hover/cover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
          <div className="px-2.5 py-1 rounded bg-black/85 text-[11px] font-medium text-zinc-200 flex items-center space-x-1.5 border border-zinc-700/60 shadow">
            <ListMusic size={12} className="text-crimson-400" />
            <span>View Tracks</span>
          </div>
        </div>

        {/* Play All overlay button */}
        <button
          onClick={handlePlayAll}
          title="Play Album"
          className="absolute bottom-2 right-2 p-2 sm:p-2.5 rounded-full bg-crimson-700 hover:bg-crimson-600 text-white shadow-xl opacity-90 sm:opacity-0 sm:group-hover/cover:opacity-100 transition transform hover:scale-110 active:scale-95 z-10"
        >
          <Play size={13} className="fill-white translate-x-0.5" />
        </button>
      </div>

      {/* Title & Metadata */}
      <div className="flex-1 min-w-0 w-full flex flex-col justify-between">
        <div>
          <div
            onClick={onOpenModal}
            className="truncate font-medium text-zinc-200 text-xs hover:text-white cursor-pointer"
            title={album.title}
          >
            {album.title}
          </div>

          <div
            className="truncate text-zinc-400 text-[11px] mt-0.5"
            title={album.artistName}
          >
            {album.artistName}
          </div>
        </div>

        <div className="flex items-center justify-between text-zinc-500 font-mono text-[10px] mt-1.5 pt-1 border-t border-charcoal-800/50">
          <span>{album.year || '-'}</span>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onOpenModal();
            }}
            className="flex items-center space-x-1 text-zinc-400 hover:text-crimson-400 transition cursor-pointer"
            title="Open Tracklist Popup"
          >
            <span>Tracks</span>
            <ListMusic size={11} />
          </button>
        </div>
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
    gridCoverSize,
    setGridCoverSize,
  } = useUiStore();

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

  // Wire search query & MusicBee sorting
  const { data: albums, isLoading } = useQuery({
    queryKey: ['albums', selectedRootId, searchQuery, searchField, albumSortBy, albumSortOrder],
    queryFn: () =>
      api.getAlbums({
        rootId: selectedRootId || undefined,
        search: searchQuery || undefined,
        searchField: searchField !== 'all' ? searchField : undefined,
        sortBy: albumSortBy || undefined,
        sortOrder: albumSortOrder || undefined,
      }),
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
  const horizontalPadding = containerWidth < 640 ? 24 : 32;
  const gap = containerWidth < 640 ? 12 : 16;
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

  const estimatedRowHeight = Math.round(usableWidth / columnCount + 70);

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
      className="flex-1 flex flex-col h-full overflow-hidden bg-charcoal-900 select-none"
    >
      {/* Grid Sub-header: Collection context, MusicBee Sorting & Zoom Slider */}
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

        {/* Right: MusicBee Sorting selector & Grid Size Slider */}
        <div className="flex items-center space-x-2 shrink-0 ml-auto">
          {/* Sorting Dropdown (MusicBee style) */}
          <div className="flex items-center space-x-1 bg-charcoal-850/80 px-2 py-1 rounded border border-charcoal-800/80 text-[11px]">
            <ArrowUpDown size={11} className="text-zinc-500 shrink-0" />
            <select
              value={currentSortValue}
              onChange={handleSortChange}
              title="MusicBee Album Sorting Options"
              className="bg-transparent text-zinc-300 focus:outline-none cursor-pointer pr-1"
            >
              <option value="albumArtist:asc" className="bg-charcoal-900 text-zinc-200">
                Artist → Year → Album (MusicBee)
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

          {/* Grid Size Zoom Control (MusicBee style) */}
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
                    className="grid gap-3 sm:gap-4 items-start"
                    style={{
                      gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))`,
                    }}
                  >
                    {rowAlbums.map((album) => (
                      <MemoizedAlbumCard
                        key={album.id}
                        album={album}
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
