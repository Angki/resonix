import React, { useEffect, useRef, useState } from 'react';
import {
  Compass,
  ListMusic,
  User,
  Table,
  FileAudio,
  Copy,
  Check,
  Disc,
  ExternalLink,
} from 'lucide-react';
import { Track } from '../types';
import { useUiStore } from '../store/uiStore';

interface PlayerContextMenuProps {
  x: number;
  y: number;
  track: Track;
  onClose: () => void;
  onOpenAlbumModal?: () => void;
}

export const PlayerContextMenu: React.FC<PlayerContextMenuProps> = ({
  x,
  y,
  track,
  onClose,
  onOpenAlbumModal,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);

  const {
    setViewMode,
    selectAlbum,
    selectArtist,
    openTrackProperties,
    setHighlightedAlbumId,
    setSearchQuery,
  } = useUiStore();

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    window.addEventListener('mousedown', handleClickOutside);
    return () => window.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  // Action 1: Locate album in Grid view & highlight with glowing ring
  const handleLocateAlbum = () => {
    if (track.albumId) {
      // Clear specific searches to make sure the album is in the active list
      setSearchQuery('');
      setViewMode('albumGrid');
      setHighlightedAlbumId(track.albumId);
    }
    onClose();
  };

  // Action 2: Open Album Tracklist Modal
  const handleOpenAlbumTracks = () => {
    if (onOpenAlbumModal) {
      onOpenAlbumModal();
    } else if (track.albumId) {
      selectAlbum(track.albumId, track.albumTitle);
      setViewMode('table');
    }
    onClose();
  };

  // Action 3: Filter by Artist
  const handleFilterArtist = () => {
    selectArtist(track.artistId || null, track.artistName);
    onClose();
  };

  // Action 4: Show in Table View
  const handleShowInTable = () => {
    if (track.albumId) {
      selectAlbum(track.albumId, track.albumTitle);
    }
    setViewMode('table');
    onClose();
  };

  // Action 5: Open Technical Properties Modal
  const handleOpenProperties = () => {
    openTrackProperties(track);
    onClose();
  };

  // Action 6: Copy Track Info
  const handleCopyInfo = () => {
    navigator.clipboard.writeText(`${track.artistName} - ${track.title}`);
    setCopied(true);
    setTimeout(() => {
      setCopied(false);
      onClose();
    }, 800);
  };

  // Ensure menu stays within window boundaries
  const posX = Math.min(Math.max(10, x), window.innerWidth - 240);
  const posY = Math.max(10, Math.min(y - 250, window.innerHeight - 270));

  return (
    <div
      ref={menuRef}
      style={{ top: posY, left: posX }}
      className="fixed z-50 w-56 bg-charcoal-850/95 border border-charcoal-700 rounded-lg shadow-2xl py-1 text-xs select-none backdrop-blur-md animate-in fade-in zoom-in-95 duration-100"
    >
      {/* Track Title Header */}
      <div className="px-3 py-1.5 border-b border-charcoal-750">
        <p className="text-[11px] font-semibold text-zinc-200 truncate">{track.title}</p>
        <p className="text-[10px] text-zinc-400 truncate">{track.artistName} • {track.albumTitle}</p>
      </div>

      {/* Source Locator: Go to Playing Track Source (Locate Album) */}
      <button
        onClick={handleLocateAlbum}
        className="w-full flex items-center space-x-2.5 px-3 py-2 hover:bg-crimson-900/50 text-zinc-200 hover:text-white transition group"
      >
        <Compass size={14} className="text-crimson-400 group-hover:rotate-45 transition-transform duration-200" />
        <div className="text-left">
          <span className="font-semibold block text-[11.5px]">Go to Album in Grid</span>
          <span className="text-[9.5px] text-zinc-400 block">Locate & highlight album card</span>
        </div>
      </button>

      {/* Open Album Tracklist */}
      <button
        onClick={handleOpenAlbumTracks}
        className="w-full flex items-center space-x-2.5 px-3 py-1.5 hover:bg-charcoal-750 text-zinc-300 hover:text-zinc-100 transition"
      >
        <ListMusic size={13} className="text-zinc-400" />
        <span>Open Album Tracklist</span>
      </button>

      {/* Show in Table Mode */}
      <button
        onClick={handleShowInTable}
        className="w-full flex items-center space-x-2.5 px-3 py-1.5 hover:bg-charcoal-750 text-zinc-300 hover:text-zinc-100 transition"
      >
        <Table size={13} className="text-zinc-400" />
        <span>View in Table Mode</span>
      </button>

      {/* Filter by Artist */}
      <button
        onClick={handleFilterArtist}
        className="w-full flex items-center space-x-2.5 px-3 py-1.5 hover:bg-charcoal-750 text-zinc-300 hover:text-zinc-100 transition"
      >
        <User size={13} className="text-zinc-400" />
        <span className="truncate">Filter Artist: {track.artistName}</span>
      </button>

      <div className="border-t border-charcoal-750 my-1" />

      {/* Technical Properties */}
      <button
        onClick={handleOpenProperties}
        className="w-full flex items-center space-x-2.5 px-3 py-1.5 hover:bg-charcoal-750 text-zinc-300 hover:text-zinc-100 transition"
      >
        <FileAudio size={13} className="text-amber-400" />
        <span>Technical File Properties</span>
      </button>

      {/* Copy Track Info */}
      <button
        onClick={handleCopyInfo}
        className="w-full flex items-center space-x-2.5 px-3 py-1.5 hover:bg-charcoal-750 text-zinc-300 hover:text-zinc-100 transition"
      >
        {copied ? <Check size={13} className="text-green-400" /> : <Copy size={13} className="text-zinc-400" />}
        <span>{copied ? 'Copied to Clipboard!' : 'Copy Track Title & Artist'}</span>
      </button>
    </div>
  );
};
