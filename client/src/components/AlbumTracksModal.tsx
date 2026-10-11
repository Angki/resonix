import React, { useEffect, useState } from 'react';
import {
  X,
  Play,
  Pause,
  Disc,
  Radio,
  ListPlus,
  Volume2,
  Table,
  Clock,
  Music,
} from 'lucide-react';
import { Album, Track } from '../types';
import { usePlayerStore } from '../store/playerStore';
import { useUiStore } from '../store/uiStore';
import { api } from '../api/client';
import { useQuery } from '@tanstack/react-query';
import { ContextMenu } from './ContextMenu';

function formatDuration(sec: number): string {
  if (!sec || isNaN(sec) || !isFinite(sec) || sec <= 0) return '--:--';
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

interface AlbumTracksModalProps {
  album: Album | null;
  isOpen: boolean;
  onClose: () => void;
}

export const AlbumTracksModal: React.FC<AlbumTracksModalProps> = ({
  album,
  isOpen,
  onClose,
}) => {
  const { playTrack, playNext, addToQueue, currentTrack, isPlaying, togglePlay } =
    usePlayerStore();
  const { selectAlbum, setViewMode } = useUiStore();

  const [trackContextMenu, setTrackContextMenu] = useState<{
    x: number;
    y: number;
    track: Track;
  } | null>(null);

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const { data: trackData, isLoading: tracksLoading } = useQuery({
    queryKey: ['albumTracksModal', album?.id],
    queryFn: () => (album ? api.getTracks({ albumId: album.id, limit: 200 }) : null),
    enabled: !!album && isOpen,
  });

  if (!isOpen || !album) return null;

  const tracks = trackData?.tracks || [];
  const totalDuration = tracks.reduce((acc, t) => acc + (t.duration || 0), 0);
  const artworkUrl = album.artworkId
    ? api.getArtworkUrl(album.artworkId, 512)
    : '/api/artwork/unknown';

  const isCurrentAlbumPlaying =
    currentTrack && tracks.some((t) => t.id === currentTrack.id);

  const handlePlayAll = () => {
    if (tracks.length > 0) {
      playTrack(tracks[0], tracks);
    }
  };

  const handlePlayNextAll = () => {
    if (tracks.length > 0) {
      playNext(tracks);
    }
  };

  const handleAddToQueueAll = () => {
    if (tracks.length > 0) {
      addToQueue(tracks);
    }
  };

  const handleOpenInTable = () => {
    selectAlbum(album.id, album.title);
    setViewMode('table');
    onClose();
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 select-none animate-fadeIn"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-charcoal-900 border border-charcoal-700 w-full max-w-2xl max-h-[88vh] rounded-lg shadow-2xl overflow-hidden flex flex-col text-xs"
      >
        {/* Modal Header: Album Hero Banner */}
        <div className="p-4 sm:p-5 bg-charcoal-950/90 border-b border-charcoal-800 flex flex-col sm:flex-row gap-4 sm:gap-5 items-center sm:items-start relative">
          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-3 right-3 p-1.5 text-zinc-400 hover:text-zinc-100 hover:bg-charcoal-800 rounded-md transition"
            title="Close (Esc)"
          >
            <X size={16} />
          </button>

          {/* Album Artwork Cover */}
          <div className="w-28 h-28 sm:w-32 sm:h-32 rounded-md bg-charcoal-850 border border-charcoal-750 overflow-hidden shadow-xl shrink-0 relative group">
            <img
              src={artworkUrl}
              alt={album.title}
              className="w-full h-full object-cover"
              onError={(e) => {
                const target = e.target as HTMLImageElement;
                target.onerror = null;
                target.src = '/api/artwork/unknown';
              }}
            />
            {/* Quick Play Overlay */}
            <button
              onClick={handlePlayAll}
              title="Play Album"
              className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition flex items-center justify-center text-white"
            >
              <div className="p-3 bg-crimson-700 rounded-full shadow-lg transform hover:scale-110 active:scale-95 transition">
                <Play size={18} className="fill-white translate-x-0.5" />
              </div>
            </button>
          </div>

          {/* Album Details & Action Buttons */}
          <div className="flex-1 min-w-0 text-center sm:text-left">
            <div className="flex items-center justify-center sm:justify-start space-x-2 text-zinc-500 font-mono text-[10px] uppercase tracking-wider mb-1">
              <Disc size={11} className="text-crimson-500" />
              <span>Album</span>
              {album.year && (
                <>
                  <span>•</span>
                  <span>{album.year}</span>
                </>
              )}
            </div>

            <h2
              className="text-base sm:text-lg font-bold text-zinc-100 truncate mb-1"
              title={album.title}
            >
              {album.title}
            </h2>

            <p
              className="text-xs sm:text-sm text-zinc-400 truncate mb-3"
              title={album.artistName}
            >
              {album.artistName}
            </p>

            {/* Metadata Pills */}
            <div className="flex items-center justify-center sm:justify-start flex-wrap gap-2 text-[10.5px] font-mono text-zinc-400 mb-3">
              <span className="px-2 py-0.5 rounded bg-charcoal-850 border border-charcoal-800">
                {album.trackCount} Tracks
              </span>
              {totalDuration > 0 && (
                <span className="px-2 py-0.5 rounded bg-charcoal-850 border border-charcoal-800 flex items-center space-x-1">
                  <Clock size={11} className="text-zinc-500" />
                  <span>{formatDuration(totalDuration)}</span>
                </span>
              )}
              {tracks.some((t) => t.isLossless) && (
                <span className="px-2 py-0.5 rounded bg-amber-950/60 border border-amber-850/60 text-amber-400 font-semibold">
                  Lossless FLAC
                </span>
              )}
            </div>

            {/* Action Buttons Toolbar */}
            <div className="flex items-center justify-center sm:justify-start flex-wrap gap-1.5">
              <button
                onClick={handlePlayAll}
                className="px-3 py-1.5 bg-crimson-700 hover:bg-crimson-600 text-white rounded font-medium text-xs transition flex items-center space-x-1.5 shadow active:scale-95"
              >
                {isCurrentAlbumPlaying && isPlaying ? (
                  <>
                    <Pause size={13} className="fill-white" />
                    <span>Pause</span>
                  </>
                ) : (
                  <>
                    <Play size={13} className="fill-white" />
                    <span>Play Album</span>
                  </>
                )}
              </button>

              <button
                onClick={handlePlayNextAll}
                className="px-2.5 py-1.5 bg-charcoal-800 hover:bg-charcoal-750 text-zinc-300 hover:text-white rounded border border-charcoal-700 font-medium text-xs transition flex items-center space-x-1 active:scale-95"
                title="Play after current track"
              >
                <Radio size={12} className="text-zinc-400" />
                <span>Play Next</span>
              </button>

              <button
                onClick={handleAddToQueueAll}
                className="px-2.5 py-1.5 bg-charcoal-800 hover:bg-charcoal-750 text-zinc-300 hover:text-white rounded border border-charcoal-700 font-medium text-xs transition flex items-center space-x-1 active:scale-95"
                title="Append to queue"
              >
                <ListPlus size={12} className="text-zinc-400" />
                <span>Add to Queue</span>
              </button>

              <button
                onClick={handleOpenInTable}
                className="px-2.5 py-1.5 bg-charcoal-800 hover:bg-charcoal-750 text-zinc-400 hover:text-white rounded border border-charcoal-700 font-medium text-xs transition flex items-center space-x-1"
                title="View full album in Table mode"
              >
                <Table size={12} />
                <span>Table View</span>
              </button>
            </div>
          </div>
        </div>

        {/* Modal Body: Tracklist */}
        <div className="flex-1 overflow-y-auto divide-y divide-charcoal-800/60 p-2 sm:p-3">
          {tracksLoading ? (
            <div className="py-12 flex flex-col items-center justify-center text-zinc-500 space-y-2">
              <div className="w-5 h-5 border-2 border-crimson-600 border-t-transparent rounded-full animate-spin" />
              <span className="font-mono text-xs">Loading tracks...</span>
            </div>
          ) : tracks.length === 0 ? (
            <div className="py-12 flex flex-col items-center justify-center text-zinc-500 space-y-2">
              <Music size={28} className="text-zinc-700" />
              <span className="font-mono text-xs">No tracks found for this album.</span>
            </div>
          ) : (
            <div className="space-y-0.5">
              {tracks.map((track, idx) => {
                const isCurrent = currentTrack?.id === track.id;
                const codecBadge = formatCodecBadge(
                  track.codec,
                  track.bitrate,
                  track.isLossless
                );

                return (
                  <div
                    key={track.id}
                    onClick={() => {
                      if (isCurrent) {
                        togglePlay();
                      } else {
                        playTrack(track, tracks);
                      }
                    }}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      setTrackContextMenu({
                        x: e.clientX,
                        y: e.clientY,
                        track,
                      });
                    }}
                    className={`group flex items-center justify-between py-2 px-2.5 rounded-md transition cursor-pointer ${
                      isCurrent
                        ? 'bg-crimson-950/70 border border-crimson-800/60 text-crimson-300'
                        : 'hover:bg-charcoal-800/80 text-zinc-300 hover:text-white border border-transparent'
                    }`}
                  >
                    {/* Left: Track Number / Play Icon & Title */}
                    <div className="flex items-center space-x-3 flex-1 min-w-0 pr-3">
                      <div className="w-5 text-center font-mono text-[10.5px] text-zinc-500 shrink-0 flex items-center justify-center">
                        {isCurrent && isPlaying ? (
                          <Volume2 size={13} className="text-crimson-500 animate-pulse" />
                        ) : isCurrent ? (
                          <Play size={10} className="text-crimson-500 fill-crimson-500" />
                        ) : (
                          <>
                            <span className="group-hover:hidden">
                              {track.trackNumber || idx + 1}
                            </span>
                            <Play
                              size={10}
                              className="hidden group-hover:block text-crimson-400 fill-crimson-400"
                            />
                          </>
                        )}
                      </div>

                      <div className="truncate min-w-0">
                        <div className="font-medium text-xs truncate" title={track.title}>
                          {track.title}
                        </div>
                        {track.artistName !== album.artistName && (
                          <div className="text-[10px] text-zinc-500 truncate mt-0.5">
                            {track.artistName}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Right: Quality Badge & Duration */}
                    <div className="flex items-center space-x-2 shrink-0 font-mono text-[10.5px] text-zinc-500">
                      {track.isLossless ? (
                        <span className="px-1.5 py-0.5 rounded bg-amber-950/60 text-amber-400 border border-amber-850/60 text-[9px] font-semibold">
                          FLAC
                        </span>
                      ) : (
                        <span className="px-1.5 py-0.5 rounded bg-charcoal-800 text-zinc-400 border border-charcoal-750 text-[9px]">
                          {codecBadge}
                        </span>
                      )}
                      <span className="w-10 text-right">{formatDuration(track.duration)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-4 py-2 bg-charcoal-950/90 border-t border-charcoal-800 flex items-center justify-between text-[11px] text-zinc-500">
          <span>Click a track to play • Right-click for options</span>
          <button
            onClick={onClose}
            className="px-3 py-1 bg-charcoal-800 hover:bg-charcoal-750 text-zinc-300 hover:text-white rounded transition text-xs"
          >
            Close
          </button>
        </div>
      </div>

      {/* Context Menu on Track */}
      {trackContextMenu && (
        <ContextMenu
          x={trackContextMenu.x}
          y={trackContextMenu.y}
          selectedTracks={[trackContextMenu.track]}
          onClose={() => setTrackContextMenu(null)}
          onPlay={(track) => playTrack(track, tracks)}
          onPlayNext={(t) => playNext(t)}
          onAddToQueue={(t) => addToQueue(t)}
          onToggleFavorite={async (t) => {
            try {
              const res = await api.toggleFavorite(t.id);
              t.isFavorite = res.isFavorite;
            } catch {
              // ignore
            }
          }}
        />
      )}
    </div>
  );
};
