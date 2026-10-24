import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Play, ListPlus, Radio, Star, FolderPlus, Info, Compass, FileAudio, Download, CheckCircle } from 'lucide-react';
import { LastFmIcon } from './LastFmIcon';
import { StarRating } from './StarRating';
import { Track } from '../types';
import { offlineStorageService } from '../services/offlineStorageService';
import { api } from '../api/client';

interface ContextMenuProps {
  x: number;
  y: number;
  selectedTracks: Track[];
  onClose: () => void;
  onPlay: (track: Track) => void;
  onPlayNext: (tracks: Track[]) => void;
  onAddToQueue: (tracks: Track[]) => void;
  onToggleFavorite: (track: Track) => void;
  onSetRating?: (track: Track, rating: number | null) => void;
  onAddToPlaylist?: (tracks: Track[]) => void;
  onShowDetails?: (track: Track) => void;
  onLocateAlbum?: (track: Track) => void;
  onOpenProperties?: (track: Track) => void;
  onSyncLastFm?: (track: Track) => void;
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
  onSetRating,
  onAddToPlaylist,
  onShowDetails,
  onLocateAlbum,
  onOpenProperties,
  onSyncLastFm,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleScroll = () => {
      onClose();
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    const handleResize = () => {
      onClose();
    };

    window.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('scroll', handleScroll, true);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('resize', handleResize);
    };
  }, [onClose]);

  if (selectedTracks.length === 0 || typeof document === 'undefined') return null;
  const primaryTrack = selectedTracks[0];

  const menuWidth = 220;
  const menuHeight = 420;
  const winWidth = typeof window !== 'undefined' ? window.innerWidth : 1200;
  const winHeight = typeof window !== 'undefined' ? window.innerHeight : 800;

  const posX = Math.max(8, Math.min(x, winWidth - menuWidth - 8));
  const posY = Math.max(8, Math.min(y, winHeight - menuHeight - 8));

  return createPortal(
    <div
      ref={menuRef}
      style={{ top: posY, left: posX }}
      className="fixed z-[9999] w-52 bg-charcoal-850/95 border border-charcoal-700 rounded-md shadow-2xl py-1 text-xs select-none backdrop-blur-md animate-in fade-in zoom-in-95 duration-100"
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

      {onSetRating && (
        <div className="flex items-center justify-between px-3 py-1.5 hover:bg-charcoal-750/50 transition">
          <span className="text-zinc-300">Rating</span>
          <StarRating
            rating={primaryTrack.rating}
            size={13}
            onChange={(value) => {
              onSetRating(primaryTrack, value);
              onClose();
            }}
          />
        </div>
      )}

      <button
        onClick={async () => {
          const isOff = offlineStorageService.isOffline(primaryTrack.id);
          if (isOff) {
            await offlineStorageService.removeTrack(primaryTrack.id);
          } else {
            await offlineStorageService.saveTrack(primaryTrack);
          }
          onClose();
        }}
        className="w-full flex items-center space-x-2 px-3 py-1.5 hover:bg-charcoal-750 text-zinc-300 hover:text-zinc-100 transition"
      >
        {offlineStorageService.isOffline(primaryTrack.id) ? (
          <>
            <CheckCircle size={13} className="text-emerald-400" />
            <span>Remove from Offline Cache</span>
          </>
        ) : (
          <>
            <Download size={13} className="text-cyan-400" />
            <span>Save for Offline Playback</span>
          </>
        )}
      </button>

      <a
        href={api.getDownloadUrl(primaryTrack.id)}
        download
        onClick={onClose}
        className="w-full flex items-center space-x-2 px-3 py-1.5 hover:bg-charcoal-750 text-zinc-300 hover:text-zinc-100 transition"
      >
        <Download size={13} className="text-cyan-400" />
        <span>Download Original File</span>
      </a>

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

      {onLocateAlbum && (
        <button
          onClick={() => {
            onLocateAlbum(primaryTrack);
            onClose();
          }}
          className="w-full flex items-center space-x-2 px-3 py-1.5 hover:bg-charcoal-750 text-zinc-300 hover:text-zinc-100 transition"
        >
          <Compass size={13} className="text-crimson-400" />
          <span>Locate in Album Grid</span>
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
          <span>Track Details (Panel)</span>
        </button>
      )}

      {onOpenProperties && (
        <button
          onClick={() => {
            onOpenProperties(primaryTrack);
            onClose();
          }}
          className="w-full flex items-center space-x-2 px-3 py-1.5 hover:bg-charcoal-750 text-zinc-300 hover:text-zinc-100 transition"
        >
          <FileAudio size={13} className="text-amber-400" />
          <span>Technical File Properties</span>
        </button>
      )}

      {onSyncLastFm && (
        <button
          onClick={() => {
            onSyncLastFm(primaryTrack);
            onClose();
          }}
          className="w-full flex items-center space-x-2 px-3 py-1.5 hover:bg-charcoal-750 text-zinc-300 hover:text-zinc-100 transition border-t border-charcoal-750/60 mt-0.5 pt-1.5"
        >
          <LastFmIcon size={13} className="text-red-500" />
          <span>Sync Last.fm Play Count</span>
        </button>
      )}
    </div>,
    document.body
  );
};
