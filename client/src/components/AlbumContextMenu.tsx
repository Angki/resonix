import React, { useEffect, useRef } from 'react';
import { Play, Radio, ListPlus, Table, ListMusic, Disc } from 'lucide-react';
import { Album, Track } from '../types';
import { usePlayerStore } from '../store/playerStore';
import { useUiStore } from '../store/uiStore';
import { api } from '../api/client';

interface AlbumContextMenuProps {
  x: number;
  y: number;
  album: Album;
  onViewTracks: () => void;
  onClose: () => void;
}

export const AlbumContextMenu: React.FC<AlbumContextMenuProps> = ({
  x,
  y,
  album,
  onViewTracks,
  onClose,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const { playTrack, playNext, addToQueue } = usePlayerStore();
  const { selectAlbum, setViewMode } = useUiStore();

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    window.addEventListener('mousedown', handleClickOutside);
    return () => window.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  const loadTracksAndRun = async (callback: (tracks: Track[]) => void) => {
    try {
      const res = await api.getTracks({ albumId: album.id, limit: 200 });
      if (res.tracks.length > 0) {
        callback(res.tracks);
      }
    } catch (e) {
      console.error('Failed to load album tracks:', e);
    }
  };

  const handlePlayAlbum = () => {
    loadTracksAndRun((tracks) => {
      playTrack(tracks[0], tracks);
    });
    onClose();
  };

  const handlePlayNext = () => {
    loadTracksAndRun((tracks) => {
      playNext(tracks);
    });
    onClose();
  };

  const handleAddToQueue = () => {
    loadTracksAndRun((tracks) => {
      addToQueue(tracks);
    });
    onClose();
  };

  const handleViewInTable = () => {
    selectAlbum(album.id, album.title);
    setViewMode('table');
    onClose();
  };

  return (
    <div
      ref={menuRef}
      style={{
        top: Math.min(y, window.innerHeight - 260),
        left: Math.min(x, window.innerWidth - 230),
      }}
      className="fixed z-50 w-56 bg-charcoal-900 border border-charcoal-700 rounded-md shadow-2xl py-1 text-xs select-none backdrop-blur-md"
    >
      {/* Header */}
      <div className="px-3 py-1.5 border-b border-charcoal-750/80 bg-charcoal-950/80">
        <div className="font-semibold text-zinc-200 truncate text-[11px] flex items-center space-x-1.5">
          <Disc size={12} className="text-crimson-500 shrink-0" />
          <span className="truncate">{album.title}</span>
        </div>
        <div className="text-[10px] text-zinc-400 truncate mt-0.5">
          {album.artistName} {album.year ? `(${album.year})` : ''} • {album.trackCount} tracks
        </div>
      </div>

      {/* Menu items */}
      <div className="py-1">
        <button
          onClick={handlePlayAlbum}
          className="w-full flex items-center space-x-2.5 px-3 py-1.5 hover:bg-crimson-900/60 text-zinc-200 hover:text-white transition"
        >
          <Play size={13} className="text-crimson-400 fill-crimson-400/40" />
          <span>Play Album</span>
        </button>

        <button
          onClick={handlePlayNext}
          className="w-full flex items-center space-x-2.5 px-3 py-1.5 hover:bg-charcoal-800 text-zinc-300 hover:text-zinc-100 transition"
        >
          <Radio size={13} className="text-zinc-400" />
          <span>Play Next</span>
        </button>

        <button
          onClick={handleAddToQueue}
          className="w-full flex items-center space-x-2.5 px-3 py-1.5 hover:bg-charcoal-800 text-zinc-300 hover:text-zinc-100 transition"
        >
          <ListPlus size={13} className="text-zinc-400" />
          <span>Add Album to Queue</span>
        </button>

        <div className="border-t border-charcoal-800 my-1" />

        <button
          onClick={handleViewInTable}
          className="w-full flex items-center space-x-2.5 px-3 py-1.5 hover:bg-charcoal-800 text-zinc-300 hover:text-zinc-100 transition"
        >
          <Table size={13} className="text-zinc-400" />
          <span>View in Track Table</span>
        </button>

        <button
          onClick={() => {
            onViewTracks();
            onClose();
          }}
          className="w-full flex items-center space-x-2.5 px-3 py-1.5 hover:bg-charcoal-800 text-zinc-300 hover:text-zinc-100 transition"
        >
          <ListMusic size={13} className="text-zinc-400" />
          <span>View Tracklist (Popup)</span>
        </button>
      </div>
    </div>
  );
};
