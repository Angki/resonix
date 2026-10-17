import React from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Flame,
  Sparkles,
  ShieldCheck,
  Timer,
  Ghost,
  Play,
  Shuffle,
  RefreshCw,
  SlidersHorizontal,
  Clock,
  ListMusic,
} from 'lucide-react';
import { useUiStore } from '../store/uiStore';
import { usePlayerStore } from '../store/playerStore';
import { api } from '../api/client';
import { TrackTable } from './TrackTable';

function formatTotalDuration(seconds: number): string {
  if (!seconds || isNaN(seconds)) return '0 min';
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  if (hrs > 0) {
    return `${hrs} jam ${mins} mnt`;
  }
  return `${mins} menit`;
}

function getPresetIcon(iconName: string, size = 28) {
  switch (iconName) {
    case 'Flame':
      return <Flame size={size} className="text-amber-400" />;
    case 'Sparkles':
      return <Sparkles size={size} className="text-emerald-400" />;
    case 'ShieldCheck':
      return <ShieldCheck size={size} className="text-cyan-400" />;
    case 'Timer':
      return <Timer size={size} className="text-purple-400" />;
    case 'Ghost':
      return <Ghost size={size} className="text-zinc-400" />;
    default:
      return <ListMusic size={size} className="text-crimson-400" />;
  }
}

export const SmartPlaylistView: React.FC = () => {
  const { selectedSmartPlaylistKey } = useUiStore();
  const { playTrack } = usePlayerStore();

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['smartPlaylist', selectedSmartPlaylistKey],
    queryFn: () => api.getSmartPlaylistDetail(selectedSmartPlaylistKey!),
    enabled: Boolean(selectedSmartPlaylistKey),
    staleTime: 1000 * 60 * 3, // 3 minutes
  });

  const handlePlayAll = () => {
    if (data?.tracks && data.tracks.length > 0) {
      playTrack(data.tracks[0], data.tracks);
    }
  };

  const handleShufflePlay = () => {
    if (data?.tracks && data.tracks.length > 0) {
      const shuffled = [...data.tracks].sort(() => Math.random() - 0.5);
      playTrack(shuffled[0], shuffled);
    }
  };

  if (!selectedSmartPlaylistKey) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-zinc-500 py-16">
        <SlidersHorizontal size={36} className="opacity-30 mb-2" />
        <p className="text-xs">Pilih salah satu Smart Playlist dari menu sebelah kiri.</p>
      </div>
    );
  }

  const preset = data?.preset;

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-charcoal-950">
      {/* Header Banner */}
      <div className="p-4 sm:p-5 bg-gradient-to-b from-charcoal-900 via-charcoal-900/90 to-charcoal-950 border-b border-charcoal-800 shrink-0">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start space-x-3.5">
            <div className="p-3 rounded-lg bg-charcoal-850 border border-charcoal-700/80 shadow-md shrink-0">
              {getPresetIcon(preset?.icon || 'ListMusic', 30)}
            </div>

            <div>
              <div className="flex items-center space-x-2">
                <span className="px-2 py-0.5 rounded text-[10px] font-mono uppercase tracking-wider bg-charcoal-800 text-zinc-300 border border-charcoal-700">
                  Smart Playlist
                </span>
                <span className="text-xs text-zinc-500 font-mono">
                  Auto-updating
                </span>
              </div>

              <h1 className="text-lg sm:text-xl font-bold text-zinc-100 tracking-tight mt-1">
                {preset?.title || 'Smart Playlist'}
              </h1>
              <p className="text-xs text-zinc-400 mt-0.5">
                {preset?.subtitle || 'Dynamic SQLite Query'}
              </p>

              <div className="flex items-center space-x-3 text-xs text-zinc-400 font-mono mt-2">
                <span>{data?.trackCount ?? 0} tracks</span>
                <span>•</span>
                <span className="flex items-center space-x-1">
                  <Clock size={12} className="text-zinc-500" />
                  <span>{formatTotalDuration(data?.totalDuration ?? 0)}</span>
                </span>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center space-x-2 shrink-0">
            <button
              onClick={handlePlayAll}
              disabled={!data?.tracks?.length}
              className="flex items-center space-x-1.5 px-3.5 py-1.5 rounded-md bg-crimson-600 hover:bg-crimson-500 text-white font-medium text-xs shadow-md transition disabled:opacity-50 cursor-pointer"
            >
              <Play size={13} fill="currentColor" />
              <span>Play All</span>
            </button>

            <button
              onClick={handleShufflePlay}
              disabled={!data?.tracks?.length}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-md bg-charcoal-800 hover:bg-charcoal-750 text-zinc-200 border border-charcoal-700 text-xs font-medium transition disabled:opacity-50 cursor-pointer"
            >
              <Shuffle size={13} />
              <span>Shuffle</span>
            </button>

            <button
              onClick={() => refetch()}
              disabled={isFetching}
              title="Perbarui daftar lagu"
              className="p-1.5 rounded-md bg-charcoal-800 hover:bg-charcoal-750 text-zinc-400 hover:text-zinc-200 border border-charcoal-700 transition cursor-pointer"
            >
              <RefreshCw size={13} className={isFetching ? 'animate-spin text-crimson-400' : ''} />
            </button>
          </div>
        </div>
      </div>

      {/* Tracks Table */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <TrackTable
          tracks={data?.tracks || []}
          isLoading={isLoading}
          isFetching={isFetching}
        />
      </div>
    </div>
  );
};
