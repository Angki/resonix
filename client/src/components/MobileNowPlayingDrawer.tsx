import React from 'react';
import {
  ChevronDown,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Shuffle,
  Repeat,
  Repeat1,
  Star,
  Sliders,
  Waves,
  ListMusic,
  Volume2,
  VolumeX,
  Radio,
} from 'lucide-react';
import { usePlayerStore } from '../store/playerStore';
import { useUiStore } from '../store/uiStore';
import { useVisualizerStore } from '../store/visualizerStore';
import { api } from '../api/client';
import { LastFmIcon } from './LastFmIcon';

function formatTime(sec: number): string {
  if (!sec || isNaN(sec) || !isFinite(sec) || sec <= 0) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

export const MobileNowPlayingDrawer: React.FC = () => {
  const {
    currentTrack,
    isPlaying,
    currentTime,
    duration,
    bufferedPercent,
    volume,
    isMuted,
    repeatMode,
    isShuffle,
    listenedSeconds,
    forceTranscode,
    togglePlay,
    previous,
    next,
    seek,
    setVolume,
    toggleMute,
    toggleRepeat,
    toggleShuffle,
    setForceTranscode,
  } = usePlayerStore();

  const {
    isMobileNowPlayingOpen,
    setMobileNowPlayingOpen,
    isEqualizerOpen,
    setEqualizerOpen,
    rightPanelOpen,
    toggleRightPanel,
    setRightPanelTab,
  } = useUiStore();

  const { isOpen: isVisualizerOpen, toggleOpen: toggleVisualizer } = useVisualizerStore();

  if (!isMobileNowPlayingOpen || !currentTrack) return null;

  const trackArtUrl = currentTrack.id ? api.getTrackArtworkUrl(currentTrack.id, 512) : '/api/artwork/unknown';
  const effDuration = duration && isFinite(duration) && duration > 0 ? duration : currentTrack.duration || 0;
  const progressPercent = effDuration > 0 ? (currentTime / effDuration) * 100 : 0;
  const scrobbleThreshold = Math.min(effDuration * 0.5, 240);
  const isEligible = effDuration >= 30;
  const isScrobbled = listenedSeconds >= scrobbleThreshold && isEligible;
  const remainingScrobbleSec = Math.max(0, Math.ceil(scrobbleThreshold - listenedSeconds));

  return (
    <div className="fixed inset-0 z-50 sm:hidden flex flex-col bg-charcoal-950/98 backdrop-blur-2xl text-zinc-100 overflow-y-auto animate-slide-up">
      {/* Top Bar: Dismiss & Header */}
      <div className="flex items-center justify-between px-5 pt-4 pb-2 shrink-0">
        <button
          onClick={() => setMobileNowPlayingOpen(false)}
          className="p-2 text-zinc-400 hover:text-white rounded-full bg-charcoal-900 border border-charcoal-800 transition active:scale-95"
          title="Minimize Now Playing"
        >
          <ChevronDown size={22} />
        </button>

        <div className="flex flex-col items-center text-center px-2 truncate">
          <span className="text-[10px] font-mono tracking-widest text-zinc-500 uppercase">PLAYING FROM</span>
          <span className="text-xs font-semibold text-zinc-300 truncate max-w-[200px]">
            {currentTrack.albumTitle || currentTrack.artistName}
          </span>
        </div>

        <button
          onClick={() => api.toggleFavorite(currentTrack.id)}
          className="p-2 text-zinc-400 hover:text-yellow-400 rounded-full bg-charcoal-900 border border-charcoal-800 transition active:scale-95"
          title="Favorite Track"
        >
          <Star
            size={19}
            className={currentTrack.isFavorite ? 'text-yellow-400 fill-yellow-400' : 'text-zinc-400'}
          />
        </button>
      </div>

      {/* Main Artwork Container */}
      <div className="flex-1 flex flex-col justify-center items-center px-7 py-4 max-h-[46vh]">
        <div className="w-full max-w-[320px] aspect-square rounded-2xl overflow-hidden bg-charcoal-900 border border-charcoal-750 shadow-2xl shadow-crimson-950/50 relative group">
          <img
            src={trackArtUrl}
            alt={currentTrack.title}
            className="w-full h-full object-cover select-none"
            onError={(e) => {
              (e.target as HTMLImageElement).src = '/api/artwork/unknown';
            }}
          />
        </div>
      </div>

      {/* Track Meta & Status Badges */}
      <div className="px-7 py-2 space-y-1.5 shrink-0">
        <div className="flex items-center justify-between">
          <div className="truncate pr-2">
            <h1 className="text-lg font-bold text-zinc-100 truncate tracking-tight">{currentTrack.title}</h1>
            <p className="text-sm font-medium text-crimson-400 truncate mt-0.5">{currentTrack.artistName}</p>
          </div>

          {/* Scrobble Indicator Pill */}
          <div className="shrink-0">
            {isScrobbled ? (
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-red-950/60 text-red-400 border border-red-750/70 shadow-sm">
                <LastFmIcon size={12} className="text-[#D51007]" />
                <span className="text-emerald-400 font-bold text-xs">✓</span>
              </span>
            ) : isEligible ? (
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-mono text-zinc-400 bg-charcoal-900 border border-charcoal-800">
                <LastFmIcon size={12} className="text-zinc-400 opacity-80" />
                <span>⏳ {remainingScrobbleSec}s</span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono text-zinc-500 bg-charcoal-900 border border-charcoal-800">
                <LastFmIcon size={10} className="text-zinc-600" />
                <span>&lt;30s</span>
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center space-x-2 text-xs text-zinc-400">
          <span className="truncate">{currentTrack.albumTitle || 'Unknown Album'}</span>
          {currentTrack.year && <span>• {currentTrack.year}</span>}
          {currentTrack.genre && <span>• {currentTrack.genre}</span>}
        </div>

        {/* Audio Quality Tag */}
        <div className="pt-1 flex items-center space-x-2">
          <button
            onClick={() => setForceTranscode(!forceTranscode)}
            className={`font-mono text-[9px] px-2 py-0.5 rounded border transition ${
              forceTranscode
                ? 'bg-charcoal-800 text-amber-400 border-amber-900/60'
                : 'bg-charcoal-850 text-zinc-400 border-charcoal-750'
            }`}
          >
            {forceTranscode ? 'TRANSCODED MP3' : currentTrack.isLossless ? 'DIRECT • FLAC' : 'DIRECT'}
          </button>
          {currentTrack.bitrate && (
            <span className="font-mono text-[9.5px] text-zinc-500">{currentTrack.bitrate} kbps</span>
          )}
        </div>
      </div>

      {/* Progress Scrubber */}
      <div className="px-7 pt-3 pb-1 shrink-0 space-y-1">
        <div className="relative flex items-center h-4 cursor-pointer w-full group">
          <div className="w-full h-1.5 bg-charcoal-800 rounded-full overflow-hidden relative">
            <div
              style={{ width: `${bufferedPercent}%` }}
              className="absolute inset-y-0 left-0 bg-charcoal-700 transition-all duration-300"
            />
            <div
              style={{ width: `${progressPercent}%` }}
              className="absolute inset-y-0 left-0 bg-crimson-600"
            />
          </div>
          <input
            type="range"
            min={0}
            max={effDuration || 1}
            step={0.1}
            value={currentTime}
            onChange={(e) => seek(parseFloat(e.target.value))}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          />
        </div>
        <div className="flex items-center justify-between text-[11px] font-mono text-zinc-400">
          <span>{formatTime(currentTime)}</span>
          <span>-{formatTime(Math.max(0, effDuration - currentTime))}</span>
        </div>
      </div>

      {/* Main Touch Playback Controls */}
      <div className="flex items-center justify-between px-7 py-3 shrink-0">
        <button
          onClick={toggleShuffle}
          title={isShuffle ? 'Shuffle On' : 'Shuffle Off'}
          className={`p-2.5 rounded-full transition active:scale-90 ${
            isShuffle ? 'text-crimson-400 bg-charcoal-800' : 'text-zinc-500'
          }`}
        >
          <Shuffle size={20} />
        </button>

        <button
          onClick={previous}
          title="Previous Track"
          className="p-3 text-zinc-200 active:scale-90 transition rounded-full hover:bg-charcoal-850"
        >
          <SkipBack size={26} />
        </button>

        <button
          onClick={togglePlay}
          title={isPlaying ? 'Pause' : 'Play'}
          className="p-4 rounded-full bg-crimson-600 hover:bg-crimson-500 text-white shadow-xl shadow-crimson-950/60 active:scale-95 transition"
        >
          {isPlaying ? <Pause size={28} className="fill-white" /> : <Play size={28} className="fill-white translate-x-0.5" />}
        </button>

        <button
          onClick={next}
          title="Next Track"
          className="p-3 text-zinc-200 active:scale-90 transition rounded-full hover:bg-charcoal-850"
        >
          <SkipForward size={26} />
        </button>

        <button
          onClick={toggleRepeat}
          title={`Repeat: ${repeatMode}`}
          className={`p-2.5 rounded-full transition active:scale-90 ${
            repeatMode !== 'off' ? 'text-crimson-400 bg-charcoal-800' : 'text-zinc-500'
          }`}
        >
          {repeatMode === 'one' ? <Repeat1 size={20} /> : <Repeat size={20} />}
        </button>
      </div>

      {/* Volume Bar */}
      <div className="px-7 py-2 flex items-center space-x-3 shrink-0">
        <button onClick={toggleMute} className="text-zinc-400 hover:text-white transition">
          {isMuted || volume === 0 ? <VolumeX size={17} /> : <Volume2 size={17} />}
        </button>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={isMuted ? 0 : volume}
          onChange={(e) => setVolume(parseFloat(e.target.value))}
          className="w-full h-1 bg-charcoal-800 accent-crimson-600 rounded cursor-pointer"
        />
      </div>

      {/* Bottom Quick Feature Launchers */}
      <div className="flex items-center justify-around px-7 pt-2 pb-6 border-t border-charcoal-850/80 mt-auto shrink-0">
        <button
          onClick={() => {
            setEqualizerOpen(!isEqualizerOpen);
            setMobileNowPlayingOpen(false);
          }}
          className="flex flex-col items-center space-y-1 text-zinc-400 hover:text-crimson-400 transition"
        >
          <Sliders size={18} />
          <span className="text-[10px] font-mono">10-BAND EQ</span>
        </button>

        <button
          onClick={() => {
            toggleVisualizer();
            setMobileNowPlayingOpen(false);
          }}
          className="flex flex-col items-center space-y-1 text-zinc-400 hover:text-crimson-400 transition"
        >
          <Waves size={18} />
          <span className="text-[10px] font-mono">VISUALIZER</span>
        </button>

        <button
          onClick={() => {
            if (!rightPanelOpen) toggleRightPanel();
            setRightPanelTab('queue');
            setMobileNowPlayingOpen(false);
          }}
          className="flex flex-col items-center space-y-1 text-zinc-400 hover:text-crimson-400 transition"
        >
          <ListMusic size={18} />
          <span className="text-[10px] font-mono">QUEUE</span>
        </button>
      </div>
    </div>
  );
};
