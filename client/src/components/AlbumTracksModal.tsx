import React, { useEffect, useState } from 'react';
import {
  X,
  Play,
  Pause,
  Disc,
  Radio,
  ListPlus,
  Volume2,
  Clock,
  Music,
  Headphones,
  Sparkles,
  Images,
  ChevronLeft,
  ChevronRight,
  Eye,
} from 'lucide-react';
import { LastFmIcon } from './LastFmIcon';
import { Album, Track, AlbumScan } from '../types';
import { usePlayerStore } from '../store/playerStore';
import { useUiStore } from '../store/uiStore';
import { api } from '../api/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
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
  const { selectArtist } = useUiStore();

  const queryClient = useQueryClient();
  const [isSyncingLastFm, setIsSyncingLastFm] = useState(false);
  const [syncStatusMsg, setSyncStatusMsg] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'tracks' | 'scans'>('tracks');
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

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

  const { data: albumScans, isLoading: scansLoading } = useQuery({
    queryKey: ['albumScans', album?.id],
    queryFn: () => (album ? api.getAlbumScans(album.id) : []),
    enabled: !!album && isOpen,
  });

  if (!isOpen || !album) return null;

  const tracks = trackData?.tracks || [];
  const totalDuration = tracks.reduce((acc, t) => acc + (t.duration || 0), 0);
  const totalAlbumPlays = tracks.reduce((acc, t) => acc + (t.combinedPlayCount || 0), 0);
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

  const handleSyncLastFm = async () => {
    if (!album || isSyncingLastFm) return;
    try {
      setIsSyncingLastFm(true);
      setSyncStatusMsg('Syncing play counts from Last.fm...');
      const res = await api.syncAlbumLastFm(album.id);
      await queryClient.invalidateQueries({ queryKey: ['albumTracksModal', album.id] });
      await queryClient.invalidateQueries({ queryKey: ['tracks'] });
      await queryClient.invalidateQueries({ queryKey: ['albumsList'] });
      setSyncStatusMsg(`Synced ${res.syncedCount} of ${res.totalTracks} tracks from Last.fm!`);
      setTimeout(() => setSyncStatusMsg(null), 4000);
    } catch (err: any) {
      setSyncStatusMsg(err.message || 'Sync failed. Connect Last.fm in Settings first.');
      setTimeout(() => setSyncStatusMsg(null), 5000);
    } finally {
      setIsSyncingLastFm(false);
    }
  };

  const handleSyncTrackLastFm = async (track: Track) => {
    try {
      const res = await api.syncTrackLastFm(track.id);
      await queryClient.invalidateQueries({ queryKey: ['albumTracksModal', album?.id] });
      await queryClient.invalidateQueries({ queryKey: ['tracks'] });
      setSyncStatusMsg(`Synced "${track.title}": ${res.playCount} plays on Last.fm`);
      setTimeout(() => setSyncStatusMsg(null), 4000);
    } catch (err: any) {
      setSyncStatusMsg(err.message || 'Failed to sync track with Last.fm');
      setTimeout(() => setSyncStatusMsg(null), 4000);
    }
  };

  // Check if album has multiple discs
  const hasMultipleDiscs = tracks.some((t) => (t.discNumber || 1) > 1);

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 select-none animate-fadeIn"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative bg-charcoal-900/95 border border-charcoal-700/80 w-full max-w-3xl max-h-[90vh] rounded-2xl shadow-[0_25px_70px_rgba(0,0,0,0.85)] overflow-hidden flex flex-col text-xs"
      >
        {/* Ambient Blurred Artwork Lighting in Header */}
        <div className="absolute top-0 left-0 right-0 h-48 overflow-hidden pointer-events-none opacity-20 filter blur-3xl -z-10">
          <img
            src={artworkUrl}
            alt=""
            className="w-full h-full object-cover scale-150 transform-gpu"
          />
        </div>

        {/* Modal Header: Album Hero Banner */}
        <div className="p-5 sm:p-6 bg-charcoal-950/80 border-b border-charcoal-800/80 flex flex-col sm:flex-row gap-5 items-center sm:items-start relative backdrop-blur-xl">
          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-3.5 right-3.5 p-2 text-zinc-400 hover:text-white hover:bg-charcoal-800/80 rounded-xl transition cursor-pointer"
            title="Close (Esc)"
          >
            <X size={18} />
          </button>

          {/* Album Artwork Cover */}
          <div className="w-32 h-32 sm:w-36 sm:h-36 rounded-xl bg-charcoal-900 border border-charcoal-700/90 overflow-hidden shadow-2xl shrink-0 relative group">
            <img
              src={artworkUrl}
              alt={album.title}
              className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
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
              className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-all duration-200 flex items-center justify-center text-white cursor-pointer"
            >
              <div className="p-3.5 bg-crimson-600 hover:bg-crimson-500 rounded-full shadow-xl transform hover:scale-110 active:scale-95 transition">
                <Play size={20} className="fill-white translate-x-0.5" />
              </div>
            </button>
          </div>

          {/* Album Details & Action Buttons */}
          <div className="flex-1 min-w-0 text-center sm:text-left">
            <div className="flex items-center justify-center sm:justify-start space-x-2 text-zinc-400 font-mono text-[10.5px] uppercase tracking-wider mb-1.5">
              <span className="flex items-center space-x-1 text-crimson-400 font-semibold">
                <Disc size={12} />
                <span>Album</span>
              </span>
              {album.year && (
                <>
                  <span>•</span>
                  <span className="text-zinc-300 font-medium">{album.year}</span>
                </>
              )}
            </div>

            <h2
              className="text-lg sm:text-2xl font-extrabold text-white tracking-tight truncate mb-1 drop-shadow-sm"
              title={album.title}
            >
              {album.title}
            </h2>

            <p
              onClick={() => {
                if (album.artistId) {
                  onClose();
                  selectArtist(album.artistId || null, album.artistName);
                }
              }}
              className="text-xs sm:text-sm font-medium text-zinc-300 hover:text-crimson-400 cursor-pointer truncate mb-3.5 inline-block transition"
              title={`View artist: ${album.artistName}`}
            >
              {album.artistName}
            </p>

            {/* Metadata Badges */}
            <div className="flex items-center justify-center sm:justify-start flex-wrap gap-2 text-[11px] font-mono text-zinc-300 mb-4">
              <span className="px-2.5 py-0.5 rounded-md bg-charcoal-850/90 border border-charcoal-750/70 text-zinc-300 shadow-xs">
                {album.trackCount} Tracks
              </span>
              {totalDuration > 0 && (
                <span className="px-2.5 py-0.5 rounded-md bg-charcoal-850/90 border border-charcoal-750/70 text-zinc-300 flex items-center space-x-1 shadow-xs">
                  <Clock size={11} className="text-zinc-400" />
                  <span>{formatDuration(totalDuration)}</span>
                </span>
              )}
              {totalAlbumPlays > 0 && (
                <span
                  className="px-2.5 py-0.5 rounded-md bg-emerald-950/70 border border-emerald-800/60 text-emerald-300 flex items-center space-x-1 shadow-xs"
                  title={`Total Album Plays: ${totalAlbumPlays.toLocaleString()} plays`}
                >
                  <Headphones size={11} className="text-emerald-400" />
                  <span>{totalAlbumPlays.toLocaleString()} Plays</span>
                </span>
              )}
              {album.qualityBadge ? (
                <span className={`px-2.5 py-0.5 rounded-md font-mono font-semibold border shadow-xs ${
                  album.qualityBadge === 'HI-RES'
                    ? 'bg-amber-950/80 border-amber-700/60 text-amber-300'
                    : album.isLossless
                    ? 'bg-cyan-950/80 border-cyan-700/60 text-cyan-300'
                    : album.qualityBadge === '320K'
                    ? 'bg-emerald-950/80 border-emerald-700/60 text-emerald-300'
                    : 'bg-charcoal-850 border-charcoal-800 text-zinc-400'
                }`}>
                  {album.qualityBadge}
                  {album.maxBitDepth ? ` ${album.maxBitDepth}bit` : ''}
                  {album.maxSampleRate ? ` / ${Math.round(album.maxSampleRate / 1000)}kHz` : ''}
                </span>
              ) : tracks.some((t) => t.isLossless) ? (
                <span className="px-2.5 py-0.5 rounded-md bg-cyan-950/80 border border-cyan-700/60 text-cyan-300 font-semibold shadow-xs">
                  Lossless FLAC
                </span>
              ) : null}
            </div>

            {/* Action Buttons Toolbar (Table View Button REMOVED) */}
            <div className="flex items-center justify-center sm:justify-start flex-wrap gap-2">
              <button
                onClick={handlePlayAll}
                className="px-4 py-2 bg-gradient-to-r from-crimson-700 to-crimson-600 hover:from-crimson-600 hover:to-crimson-500 text-white rounded-xl font-semibold text-xs transition flex items-center space-x-2 shadow-lg hover:shadow-crimson-900/50 active:scale-95 cursor-pointer"
              >
                {isCurrentAlbumPlaying && isPlaying ? (
                  <>
                    <Pause size={14} className="fill-white" />
                    <span>Pause</span>
                  </>
                ) : (
                  <>
                    <Play size={14} className="fill-white translate-x-0.5" />
                    <span>Play Album</span>
                  </>
                )}
              </button>

              <button
                onClick={handlePlayNextAll}
                className="px-3 py-2 bg-charcoal-800/90 hover:bg-charcoal-750 text-zinc-200 hover:text-white rounded-xl border border-charcoal-700 font-medium text-xs transition flex items-center space-x-1.5 active:scale-95 cursor-pointer"
                title="Play after current track"
              >
                <Radio size={13} className="text-zinc-400" />
                <span>Play Next</span>
              </button>

              <button
                onClick={handleAddToQueueAll}
                className="px-3 py-2 bg-charcoal-800/90 hover:bg-charcoal-750 text-zinc-200 hover:text-white rounded-xl border border-charcoal-700 font-medium text-xs transition flex items-center space-x-1.5 active:scale-95 cursor-pointer"
                title="Append to queue"
              >
                <ListPlus size={13} className="text-zinc-400" />
                <span>Add to Queue</span>
              </button>

              <button
                onClick={handleSyncLastFm}
                disabled={isSyncingLastFm}
                className="px-3 py-2 bg-charcoal-800/90 hover:bg-charcoal-750 disabled:opacity-50 text-zinc-200 hover:text-white rounded-xl border border-charcoal-700 font-medium text-xs transition flex items-center space-x-1.5 active:scale-95 cursor-pointer"
                title="Sync play counts from Last.fm for all tracks in this album"
              >
                {isSyncingLastFm ? (
                  <div className="w-3.5 h-3.5 border-2 border-crimson-500 border-t-transparent rounded-full animate-spin" />
                ) : (
                  <LastFmIcon size={13} className="text-red-500" />
                )}
                <span>{isSyncingLastFm ? 'Syncing...' : 'Sync Last.fm'}</span>
              </button>
            </div>

            {/* Last.fm Sync Feedback Banner */}
            {syncStatusMsg && (
              <div className="mt-3 px-3 py-1.5 rounded-lg bg-charcoal-850/95 border border-charcoal-700 text-[11.5px] font-mono text-zinc-200 flex items-center space-x-2 animate-fadeIn shadow-md">
                <span className="w-2 h-2 rounded-full bg-crimson-500 shrink-0 animate-pulse" />
                <span className="truncate">{syncStatusMsg}</span>
              </div>
            )}
          </div>
        </div>

        {/* Navigation Tabs: Tracks vs Physical Media Scans */}
        <div className="flex items-center space-x-1 px-4 sm:px-6 bg-charcoal-950/90 border-b border-charcoal-800">
          <button
            onClick={() => setActiveTab('tracks')}
            className={`px-3.5 py-2 text-xs font-medium border-b-2 transition flex items-center space-x-1.5 ${
              activeTab === 'tracks'
                ? 'border-crimson-500 text-white font-semibold'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Music size={13} />
            <span>Tracks ({tracks.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('scans')}
            className={`px-3.5 py-2 text-xs font-medium border-b-2 transition flex items-center space-x-1.5 ${
              activeTab === 'scans'
                ? 'border-crimson-500 text-white font-semibold'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Images size={13} />
            <span>Scans & Booklet</span>
            {albumScans && albumScans.length > 0 && (
              <span className="font-mono text-[9px] px-1.5 py-0.2 rounded-full bg-crimson-950 text-crimson-300 border border-crimson-700/60 font-bold ml-0.5">
                {albumScans.length}
              </span>
            )}
          </button>
        </div>

        {/* Modal Body: Tracklist or Scans */}
        {activeTab === 'scans' ? (
          <div className="flex-1 overflow-y-auto p-4 sm:p-5 scrollbar-thin scrollbar-thumb-charcoal-700">
            {scansLoading ? (
              <div className="py-20 flex flex-col items-center justify-center text-zinc-500 space-y-3">
                <div className="w-7 h-7 border-2 border-crimson-500 border-t-transparent rounded-full animate-spin" />
                <span className="font-mono text-xs text-zinc-400">Scanning album artwork & booklets...</span>
              </div>
            ) : !albumScans || albumScans.length === 0 ? (
              <div className="py-20 flex flex-col items-center justify-center text-zinc-500 space-y-2 text-center px-4">
                <Images size={36} className="text-zinc-700 mb-1" />
                <span className="font-semibold text-zinc-300 text-sm">No Accompanying Scans Found</span>
                <p className="font-mono text-[11px] text-zinc-500 max-w-md">
                  No images or booklet scans were detected in this album's folder. Scans placed in the album root or a &quot;scans/&quot; subfolder will automatically appear here.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 sm:gap-4">
                {albumScans.map((scan, idx) => {
                  const scanUrl = api.getAlbumScanFileUrl(album.id, scan.relPath);
                  const typeColors: Record<string, string> = {
                    front: 'bg-crimson-950/80 text-crimson-300 border-crimson-700/60',
                    back: 'bg-amber-950/80 text-amber-300 border-amber-700/60',
                    booklet: 'bg-purple-950/80 text-purple-300 border-purple-700/60',
                    disc: 'bg-cyan-950/80 text-cyan-300 border-cyan-700/60',
                    inlay: 'bg-emerald-950/80 text-emerald-300 border-emerald-700/60',
                    other: 'bg-charcoal-800 text-zinc-400 border-charcoal-700',
                  };

                  return (
                    <div
                      key={scan.id}
                      onClick={() => setLightboxIndex(idx)}
                      className="group relative bg-charcoal-950 rounded-xl border border-charcoal-800 overflow-hidden shadow-lg hover:border-crimson-600/70 transition duration-200 cursor-pointer flex flex-col"
                    >
                      <div className="relative aspect-square w-full bg-charcoal-900 overflow-hidden flex items-center justify-center">
                        <img
                          src={scanUrl}
                          alt={scan.name}
                          loading="lazy"
                          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                        />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                          <div className="p-2 bg-crimson-600/90 rounded-full text-white shadow-lg">
                            <Eye size={16} />
                          </div>
                        </div>
                      </div>

                      <div className="p-2.5 flex flex-col justify-between flex-1 bg-charcoal-900/90">
                        <div className="flex items-center justify-between gap-1 mb-1">
                          <span className={`font-mono text-[9px] px-1.5 py-0.2 rounded uppercase font-semibold border ${typeColors[scan.type] || typeColors.other}`}>
                            {scan.type}
                          </span>
                          <span className="font-mono text-[9px] text-zinc-500">
                            {(scan.size / 1024 / 1024).toFixed(1)} MB
                          </span>
                        </div>
                        <div className="font-mono text-[10.5px] text-zinc-300 truncate" title={scan.name}>
                          {scan.name}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto divide-y divide-charcoal-800/40 p-3 sm:p-4 scrollbar-thin scrollbar-thumb-charcoal-700">
            {tracksLoading ? (
              <div className="py-16 flex flex-col items-center justify-center text-zinc-500 space-y-3">
                <div className="w-7 h-7 border-2 border-crimson-500 border-t-transparent rounded-full animate-spin" />
                <span className="font-mono text-xs text-zinc-400">Loading tracks...</span>
              </div>
            ) : tracks.length === 0 ? (
              <div className="py-16 flex flex-col items-center justify-center text-zinc-500 space-y-2">
                <Music size={32} className="text-zinc-700" />
                <span className="font-mono text-xs text-zinc-400">No tracks found for this album.</span>
              </div>
            ) : (
              <div className="space-y-1">
              {tracks.map((track, idx) => {
                const isCurrent = currentTrack?.id === track.id;
                const codecBadge = formatCodecBadge(
                  track.codec,
                  track.bitrate,
                  track.isLossless
                );

                // Show disc divider if first track of disc > 1 or disc changed
                const prevTrack = idx > 0 ? tracks[idx - 1] : null;
                const showDiscDivider =
                  hasMultipleDiscs &&
                  (idx === 0 || (track.discNumber && track.discNumber !== prevTrack?.discNumber));

                return (
                  <React.Fragment key={track.id}>
                    {showDiscDivider && (
                      <div className="flex items-center space-x-2 py-2 px-3 text-[11px] font-mono font-bold text-zinc-400 bg-charcoal-850/60 rounded-md my-1 border border-charcoal-800/80">
                        <Disc size={13} className="text-crimson-400" />
                        <span>DISC {track.discNumber || 1}</span>
                      </div>
                    )}

                    <div
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
                      className={`group flex items-center justify-between py-2 px-3 rounded-lg transition duration-150 cursor-pointer ${
                        isCurrent
                          ? 'bg-crimson-950/70 border border-crimson-700/70 text-crimson-200 shadow-sm'
                          : 'hover:bg-charcoal-800/75 text-zinc-300 hover:text-white border border-transparent'
                      }`}
                    >
                      {/* Left: Track Number / Play Icon & Title */}
                      <div className="flex items-center space-x-3.5 flex-1 min-w-0 pr-3">
                        <div className="w-5 text-center font-mono text-[11px] text-zinc-500 shrink-0 flex items-center justify-center">
                          {isCurrent && isPlaying ? (
                            <Volume2 size={14} className="text-crimson-400 animate-pulse" />
                          ) : isCurrent ? (
                            <Play size={11} className="text-crimson-400 fill-crimson-400" />
                          ) : (
                            <>
                              <span className="group-hover:hidden">
                                {track.trackNumber || idx + 1}
                              </span>
                              <Play
                                size={11}
                                className="hidden group-hover:block text-crimson-400 fill-crimson-400"
                              />
                            </>
                          )}
                        </div>

                        <div className="truncate min-w-0">
                          <div className={`font-medium text-xs truncate ${isCurrent ? 'text-white font-semibold' : ''}`} title={track.title}>
                            {track.title}
                          </div>
                          {track.artistName !== album.artistName && (
                            <div className="text-[10px] text-zinc-400 truncate mt-0.5">
                              {track.artistName}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Right: Play Count, Quality Badge & Duration */}
                      <div className="flex items-center space-x-3 shrink-0 font-mono text-[11px] text-zinc-500">
                        {/* Play Count Badge */}
                        {(track.combinedPlayCount ?? 0) > 0 ? (
                          <span
                            className="px-2 py-0.5 rounded text-[10.5px] font-mono flex items-center space-x-1.5 bg-emerald-950/60 text-emerald-400 border border-emerald-800/50 shadow-xs"
                            title={`Total plays: ${track.combinedPlayCount} (Local: ${track.localPlayCount || 0}, Last.fm: ${track.importedPlayCount || 0})`}
                          >
                            <Headphones size={10} className="text-emerald-400" />
                            <span>{track.combinedPlayCount}</span>
                          </span>
                        ) : (
                          <span className="text-[10.5px] text-zinc-600 px-1.5 font-mono">
                            -
                          </span>
                        )}

                        {track.isLossless ? (
                          <span className="px-1.5 py-0.5 rounded bg-cyan-950/70 text-cyan-300 border border-cyan-800/60 text-[9.5px] font-semibold">
                            FLAC
                          </span>
                        ) : (
                          <span className="px-1.5 py-0.5 rounded bg-charcoal-800 text-zinc-400 border border-charcoal-700 text-[9.5px]">
                            {codecBadge}
                          </span>
                        )}

                        <span className="w-11 text-right text-zinc-400 font-mono">
                          {formatDuration(track.duration)}
                        </span>
                      </div>
                    </div>
                  </React.Fragment>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Full-Screen Scans Lightbox Viewer */}
      {lightboxIndex !== null && albumScans && albumScans[lightboxIndex] && (
        <div
          onClick={() => setLightboxIndex(null)}
          className="fixed inset-0 z-[70] bg-black/95 backdrop-blur-xl flex flex-col items-center justify-between p-3 sm:p-6 select-none animate-fadeIn"
        >
          {/* Lightbox Header */}
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full flex items-center justify-between text-zinc-300 font-mono text-xs px-2 py-1"
          >
            <div className="flex items-center space-x-2">
              <span className="font-semibold text-white truncate max-w-xs sm:max-w-md">
                {albumScans[lightboxIndex].name}
              </span>
              <span className="px-1.5 py-0.5 rounded bg-charcoal-800 text-[10px] text-crimson-400 border border-charcoal-700 uppercase font-bold">
                {albumScans[lightboxIndex].type}
              </span>
            </div>
            <div className="flex items-center space-x-3">
              <span className="text-zinc-400">
                {lightboxIndex + 1} / {albumScans.length}
              </span>
              <button
                onClick={() => setLightboxIndex(null)}
                className="p-1.5 rounded-lg bg-charcoal-800 hover:bg-charcoal-700 text-zinc-300 hover:text-white transition"
                title="Close Lightbox (Esc)"
              >
                <X size={18} />
              </button>
            </div>
          </div>

          {/* Lightbox Center Image with Navigation Controls */}
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative flex-1 w-full flex items-center justify-center overflow-hidden my-2"
          >
            {lightboxIndex > 0 && (
              <button
                onClick={() => setLightboxIndex(lightboxIndex - 1)}
                className="absolute left-2 sm:left-6 z-10 p-3 rounded-full bg-charcoal-900/80 hover:bg-crimson-600 text-white border border-charcoal-700/80 shadow-2xl transition transform -translate-y-1/2 top-1/2 hover:scale-110 active:scale-95 cursor-pointer"
                title="Previous Image (Left Arrow)"
              >
                <ChevronLeft size={22} />
              </button>
            )}

            <img
              src={api.getAlbumScanFileUrl(album.id, albumScans[lightboxIndex].relPath)}
              alt={albumScans[lightboxIndex].name}
              className="max-h-[80vh] max-w-[90vw] object-contain rounded-lg shadow-2xl transition duration-200"
            />

            {lightboxIndex < albumScans.length - 1 && (
              <button
                onClick={() => setLightboxIndex(lightboxIndex + 1)}
                className="absolute right-2 sm:right-6 z-10 p-3 rounded-full bg-charcoal-900/80 hover:bg-crimson-600 text-white border border-charcoal-700/80 shadow-2xl transition transform -translate-y-1/2 top-1/2 hover:scale-110 active:scale-95 cursor-pointer"
                title="Next Image (Right Arrow)"
              >
                <ChevronRight size={22} />
              </button>
            )}
          </div>

          {/* Lightbox Footer Thumbnail Strip */}
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full flex items-center justify-center space-x-2 py-2 overflow-x-auto no-scrollbar"
          >
            {albumScans.map((s, idx) => (
              <button
                key={s.id}
                onClick={() => setLightboxIndex(idx)}
                className={`w-12 h-12 rounded-lg overflow-hidden border-2 transition shrink-0 ${
                  lightboxIndex === idx
                    ? 'border-crimson-500 scale-105 shadow-md shadow-crimson-900/50'
                    : 'border-charcoal-700 opacity-60 hover:opacity-100'
                }`}
              >
                <img
                  src={api.getAlbumScanFileUrl(album.id, s.relPath)}
                  alt=""
                  className="w-full h-full object-cover"
                />
              </button>
            ))}
          </div>
        </div>
      )}

        {/* Modal Footer */}
        <div className="px-5 py-3 bg-charcoal-950/90 border-t border-charcoal-800 flex items-center justify-between text-[11px] text-zinc-400 backdrop-blur-md">
          <span className="flex items-center space-x-1.5">
            <Sparkles size={11} className="text-amber-400" />
            <span>Click track to play • Right-click for options • Press Esc to close</span>
          </span>
          <button
            onClick={onClose}
            className="px-3.5 py-1.5 bg-charcoal-800 hover:bg-charcoal-750 text-zinc-200 hover:text-white rounded-lg transition text-xs font-medium cursor-pointer border border-charcoal-700"
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
          onSyncLastFm={handleSyncTrackLastFm}
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
