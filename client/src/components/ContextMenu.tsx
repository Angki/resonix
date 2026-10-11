import React, { useEffect, useRef } from 'react';
import { Play, ListPlus, Radio, Star, FolderPlus, Info } from 'lucide-react';
import { Track } from '../types';

interface ContextMenuProps {
  x: number;
  y: number;
  selectedTracks: Track[];
  onClose: () => void;
  onPlay: (track: Track) => void;
  onPlayNext: (tracks: Track[]) => void;
  onAddToQueue: (tracks: Track[]) => void;
  onToggleFavorite: (track: Track) => void;
  onAddToPlaylist?: (tracks: Track[]) => void;
  onShowDetails?: (track: Track) => void;
}

export const ContextMenu: React.FC<ContextMenuProps> = ({
  x,
  y,
  selectedTracks,
  onClose,
  onPlay,
  onPlayNext,
  onAddToQueue,
  onToggleFavorite,
  onAddToPlaylist,
  onShowDetails,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    window.addEventListener('mousedown', handleClickOutside);
    return () => window.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  if (selectedTracks.length === 0) return null;
  const primaryTrack = selectedTracks[0];

  return (
    <div
      ref={menuRef}
      style={{ top: Math.min(y, window.innerHeight - 250), left: Math.min(x, window.innerWidth - 220) }}
      className="fixed z-50 w-52 bg-charcoal-850 border border-charcoal-700 rounded-md shadow-2xl py-1 text-xs select-none backdrop-blur-md"
    >
      <div className="px-3 py-1 text-[11px] font-semibold text-zinc-400 border-b border-charcoal-750 truncate">
        {selectedTracks.length === 1 ? primaryTrack.title : `${selectedTracks.length} tracks selected`}
      </div>

      <button
        onClick={() => {
          onPlay(primaryTrack);
          onClose();
        }}
        className="w-full flex items-center space-x-2 px-3 py-1.5 hover:bg-crimson-900/60 text-zinc-200 hover:text-white transition"
      >
        <Play size={13} className="text-crimson-400 fill-crimson-400/40" />
        <span>Play</span>
      </button>

      <button
        onClick={() => {
          onPlayNext(selectedTracks);
          onClose();
        }}
        className="w-full flex items-center space-x-2 px-3 py-1.5 hover:bg-charcoal-750 text-zinc-300 hover:text-zinc-100 transition"
      >
        <Radio size={13} className="text-zinc-400" />
        <span>Play Next</span>
      </button>

      <button
        onClick={() => {
          onAddToQueue(selectedTracks);
          onClose();
        }}
        className="w-full flex items-center space-x-2 px-3 py-1.5 hover:bg-charcoal-750 text-zinc-300 hover:text-zinc-100 transition"
      >
        <ListPlus size={13} className="text-zinc-400" />
        <span>Queue Tracks</span>
      </button>

      <div className="border-t border-charcoal-750 my-1" />

      <button
        onClick={() => {
          onToggleFavorite(primaryTrack);
          onClose();
        }}
        className="w-full flex items-center space-x-2 px-3 py-1.5 hover:bg-charcoal-750 text-zinc-300 hover:text-zinc-100 transition"
      >
        <Star size={13} className={primaryTrack.isFavorite ? 'text-yellow-400 fill-yellow-400' : 'text-zinc-400'} />
        <span>{primaryTrack.isFavorite ? 'Remove Favorite' : 'Add to Favorites'}</span>
      </button>

      {onAddToPlaylist && (
        <button
          onClick={() => {
            onAddToPlaylist(selectedTracks);
            onClose();
          }}
          className="w-full flex items-center space-x-2 px-3 py-1.5 hover:bg-charcoal-750 text-zinc-300 hover:text-zinc-100 transition"
        >
          <FolderPlus size={13} className="text-zinc-400" />
          <span>Add to Playlist...</span>
        </button>
      )}

      {onShowDetails && (
        <button
          onClick={() => {
            onShowDetails(primaryTrack);
            onClose();
          }}
          className="w-full flex items-center space-x-2 px-3 py-1.5 hover:bg-charcoal-750 text-zinc-300 hover:text-zinc-100 transition"
        >
          <Info size={13} className="text-zinc-400" />
          <span>Track Properties</span>
        </button>
      )}
    </div>
  );
};
