import React, { useEffect, useRef, useState } from 'react';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Repeat,
  Repeat1,
  Shuffle,
  Volume2,
  VolumeX,
  ListMusic,
  Star,
  Settings2,
  Sliders,
} from 'lucide-react';
import { usePlayerStore } from '../store/playerStore';
import { useUiStore } from '../store/uiStore';
import { useEqualizerStore, EQ_FREQUENCIES } from '../store/equalizerStore';
import { api } from '../api/client';

function formatTime(sec: number): string {
  if (!sec || isNaN(sec) || !isFinite(sec) || sec <= 0) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

export const PlayerBar: React.FC = () => {
  const audioRef = useRef<HTMLAudioElement | null>(null);

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
    queue,
    sessionId,
    forceTranscode,
    togglePlay,
    pause,
    resume,
    next,
    previous,
    seek,
    setVolume,
    toggleMute,
    toggleRepeat,
    toggleShuffle,
    setCurrentTime,
    setDuration,
    setBufferedPercent,
    setSessionId,
    incrementListenedSeconds,
    resetListenedSeconds,
    setForceTranscode,
  } = usePlayerStore();

  const {
    rightPanelOpen,
    toggleRightPanel,
    setRightPanelTab,
    isEqualizerOpen,
    setEqualizerOpen,
  } = useUiStore();

  const { isEnabled: isEqEnabled, gains: eqGains } = useEqualizerStore();

  const [isSeeking, setIsSeeking] = useState(false);
  const [seekValue, setSeekValue] = useState(0);

  const lastTrackIdRef = useRef<string | null>(null);
  const lastTimeRef = useRef<number>(0);
  const listenedSinceLastReportRef = useRef<number>(0);

  // Web Audio API equalizer nodes
  const audioCtxRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<MediaElementAudioSourceNode | null>(null);
  const filtersRef = useRef<BiquadFilterNode[]>([]);

  // Setup Web Audio API filter chain
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (!audioCtxRef.current) {
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtxClass) {
        try {
          const ctx = new AudioCtxClass();
          audioCtxRef.current = ctx;

          if (!sourceNodeRef.current) {
            const srcNode = ctx.createMediaElementSource(audio);
            sourceNodeRef.current = srcNode;

            const filters: BiquadFilterNode[] = EQ_FREQUENCIES.map((freq, i) => {
              const filter = ctx.createBiquadFilter();
              if (i === 0) {
                filter.type = 'lowshelf';
              } else if (i === EQ_FREQUENCIES.length - 1) {
                filter.type = 'highshelf';
              } else {
                filter.type = 'peaking';
                filter.Q.value = 1.4;
              }
              filter.frequency.value = freq;
              filter.gain.value = 0;
              return filter;
            });

            // Chain: src -> filter[0] -> ... -> destination
            let prevNode: AudioNode = srcNode;
            filters.forEach((f) => {
              prevNode.connect(f);
              prevNode = f;
            });
            prevNode.connect(ctx.destination);
            filtersRef.current = filters;
          }
        } catch (e) {
          console.warn('Web Audio API equalizer initialization skipped:', e);
        }
      }
    }
  }, []);

  // Update EQ filter gains
  useEffect(() => {
    const ctx = audioCtxRef.current;
    if (!ctx || filtersRef.current.length === 0) return;

    filtersRef.current.forEach((filter, idx) => {
      const targetGain = isEqEnabled ? (eqGains[idx] ?? 0) : 0;
      try {
        filter.gain.setTargetAtTime(targetGain, ctx.currentTime, 0.05);
      } catch {
        filter.gain.value = targetGain;
      }
    });
  }, [isEqEnabled, eqGains]);

  // Sync audio element with currentTrack
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !currentTrack) return;

    if (lastTrackIdRef.current !== currentTrack.id) {
      lastTrackIdRef.current = currentTrack.id;
      lastTimeRef.current = 0;
      listenedSinceLastReportRef.current = 0;
      resetListenedSeconds();

      // Resume audio context if suspended
      if (audioCtxRef.current && audioCtxRef.current.state === 'suspended') {
        audioCtxRef.current.resume().catch(() => {});
      }

      // Start new playback session on backend
      api.startPlayback(currentTrack.id).then((res) => {
        setSessionId(res.sessionId);
      }).catch(err => {
        console.error('Failed to start playback session:', err);
      });

      const streamUrl = api.getStreamUrl(currentTrack.id, forceTranscode);
      audio.src = streamUrl;

      if (isPlaying) {
        const playPromise = audio.play();
        if (playPromise !== undefined) {
          playPromise.catch((err) => {
            // If play was interrupted by next track load, catch silently
            if (err.name !== 'AbortError') {
              console.warn('Autoplay error:', err);
            }
          });
        }
      }
    }
  }, [currentTrack, forceTranscode, isPlaying, resetListenedSeconds, setSessionId]);

  // Sync isPlaying state changes
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !currentTrack) return;

    if (audioCtxRef.current && audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume().catch(() => {});
    }

    if (isPlaying && audio.paused) {
      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise.catch((e) => {
          if (e.name !== 'AbortError') console.warn('Play prevented:', e);
        });
      }
    } else if (!isPlaying && !audio.paused) {
      audio.pause();
    }
  }, [isPlaying]);

  // Sync volume
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = isMuted ? 0 : volume;
  }, [volume, isMuted]);

  // Enhanced Media Session API integration
  useEffect(() => {
    if (!('mediaSession' in navigator) || !currentTrack) return;

    const artworkUrl = api.getTrackArtworkUrl(currentTrack.id, 512);

    navigator.mediaSession.metadata = new MediaMetadata({
      title: currentTrack.title,
      artist: currentTrack.artistName,
      album: currentTrack.albumTitle || 'Unknown Album',
      artwork: [
        { src: artworkUrl, sizes: '512x512', type: 'image/webp' },
        { src: artworkUrl, sizes: '256x256', type: 'image/webp' },
      ],
    });

    navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';

    navigator.mediaSession.setActionHandler('play', () => resume());
    navigator.mediaSession.setActionHandler('pause', () => pause());
    navigator.mediaSession.setActionHandler('previoustrack', () => previous());
    navigator.mediaSession.setActionHandler('nexttrack', () => next());
    navigator.mediaSession.setActionHandler('seekbackward', (details) => {
      const offset = details.seekOffset || 10;
      if (audioRef.current) {
        const target = Math.max(0, audioRef.current.currentTime - offset);
        audioRef.current.currentTime = target;
        seek(target);
      }
    });
    navigator.mediaSession.setActionHandler('seekforward', (details) => {
      const offset = details.seekOffset || 10;
      if (audioRef.current) {
        const target = audioRef.current.currentTime + offset;
        audioRef.current.currentTime = target;
        seek(target);
      }
    });
    navigator.mediaSession.setActionHandler('seekto', (details) => {
      if (details.seekTime !== undefined && audioRef.current) {
        audioRef.current.currentTime = details.seekTime;
        seek(details.seekTime);
      }
    });
  }, [currentTrack, isPlaying, resume, pause, previous, next, seek]);

  // Handle actual listening time accumulation and backend reporting
  const handleTimeUpdate = () => {
    const audio = audioRef.current;
    if (!audio || !currentTrack) return;

    const cur = audio.currentTime;
    setCurrentTime(cur);

    if (!isSeeking) {
      const delta = cur - lastTimeRef.current;
      // Normal playback progress: delta should be between 0 and 1.5 seconds
      if (delta > 0 && delta < 1.5 && !audio.paused) {
        incrementListenedSeconds(delta);
        listenedSinceLastReportRef.current += delta;

        // Periodic report every 15 seconds
        if (listenedSinceLastReportRef.current >= 15) {
          const currentSessionId = usePlayerStore.getState().sessionId;
          const currentListened = usePlayerStore.getState().listenedSeconds;

          if (currentSessionId) {
            api.reportProgress({
              trackId: currentTrack.id,
              sessionId: currentSessionId,
              listenedSeconds: currentListened,
              eventId: crypto.randomUUID(),
            }).catch(e => console.warn('Progress report failed:', e));
          }
          listenedSinceLastReportRef.current = 0;
        }
      }
    }
    lastTimeRef.current = cur;
  };

  const handleProgress = () => {
    const audio = audioRef.current;
    if (!audio || audio.buffered.length === 0) return;
    try {
      const bufferedEnd = audio.buffered.end(audio.buffered.length - 1);
      const total = audio.duration || currentTrack?.duration || 1;
      setBufferedPercent((bufferedEnd / total) * 100);
    } catch {
      // ignore
    }
  };

  const handleEnded = () => {
    const currentSessionId = usePlayerStore.getState().sessionId;
    const currentListened = usePlayerStore.getState().listenedSeconds;

    if (currentTrack && currentSessionId) {
      api.reportProgress({
        trackId: currentTrack.id,
        sessionId: currentSessionId,
        listenedSeconds: currentListened,
        eventId: crypto.randomUUID(),
      }).catch(e => console.warn('Final progress report failed:', e));
    }

    if (repeatMode === 'one') {
      if (audioRef.current) {
        audioRef.current.currentTime = 0;
        audioRef.current.play();
      }
    } else {
      next();
    }
  };

  const handleSeekCommit = (val: number) => {
    setIsSeeking(false);
    if (audioRef.current) {
      audioRef.current.currentTime = val;
      lastTimeRef.current = val;
    }
    seek(val);
  };

  const trackArtUrl = currentTrack?.id
    ? api.getTrackArtworkUrl(currentTrack.id, 96)
    : '/api/artwork/unknown';

  const effectiveDuration =
    duration && isFinite(duration) && duration > 0
      ? duration
      : currentTrack?.duration && isFinite(currentTrack.duration) && currentTrack.duration > 0
      ? currentTrack.duration
      : 0;
  const currentPos = isSeeking ? seekValue : currentTime;
  const progressPercent = effectiveDuration > 0 ? (currentPos / effectiveDuration) * 100 : 0;

  return (
    <footer className="bg-charcoal-950 border-t border-charcoal-750 flex flex-col sm:flex-row sm:items-center sm:justify-between px-2 sm:px-3 select-none shrink-0 relative z-40 text-xs">
      <audio
        ref={audioRef}
        onTimeUpdate={handleTimeUpdate}
        onProgress={handleProgress}
        onDurationChange={() => {
          if (audioRef.current && isFinite(audioRef.current.duration) && audioRef.current.duration > 0) {
            setDuration(audioRef.current.duration);
          }
        }}
        onEnded={handleEnded}
        onError={(e) => {
          console.warn('Audio element error:', e);
          if (!forceTranscode && currentTrack) {
            console.log('Direct playback failed, switching to transcode fallback...');
            setForceTranscode(true);
          }
        }}
      />

      {/* Mobile Top Edge: Scrub bar with explicit time display */}
      <div className="sm:hidden px-2 pt-1.5 pb-0.5 flex flex-col w-full bg-charcoal-950/95 border-b border-charcoal-850/60">
        <div className="flex items-center justify-between text-[10px] font-mono text-zinc-400 mb-0.5">
          <span className="w-8 text-left">{formatTime(currentPos)}</span>
          <span className="text-zinc-400 font-sans truncate px-2 text-center text-[10.5px]">
            {currentTrack ? `${currentTrack.artistName} - ${currentTrack.title}` : 'No audio loaded'}
          </span>
          <span className="w-8 text-right text-zinc-500">{formatTime(effectiveDuration)}</span>
        </div>
        <div className="relative flex items-center h-3 cursor-pointer w-full group">
          <div className="w-full h-1 bg-charcoal-800 rounded-full overflow-hidden relative">
            <div
              style={{ width: `${bufferedPercent}%` }}
              className="absolute inset-y-0 left-0 bg-charcoal-700 transition-all duration-300"
            />
            <div
              style={{ width: `${progressPercent}%` }}
              className="absolute inset-y-0 left-0 bg-crimson-600 group-hover:bg-crimson-500"
            />
          </div>
          <input
            type="range"
            min={0}
            max={effectiveDuration || 1}
            step={0.1}
            value={currentPos}
            onChange={(e) => {
              setIsSeeking(true);
              setSeekValue(parseFloat(e.target.value));
            }}
            onMouseUp={() => handleSeekCommit(seekValue)}
            onTouchEnd={() => handleSeekCommit(seekValue)}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          />
        </div>
      </div>

      {/* Main Bar Row (Mobile bottom row & Desktop full height row) */}
      <div className="h-14 sm:h-16 flex items-center justify-between w-full">
        {/* Left: Track Thumbnail and Info */}
        <div className="flex items-center space-x-2 sm:space-x-3 flex-1 sm:flex-initial sm:w-1/4 sm:min-w-[170px] max-w-[48%] sm:max-w-none truncate">
          {currentTrack ? (
            <>
              <div className="w-9 h-9 sm:w-10 sm:h-10 rounded bg-charcoal-900 border border-charcoal-800 overflow-hidden shrink-0 relative">
                <img
                  src={trackArtUrl}
                  alt={currentTrack.title}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = '/api/artwork/unknown';
                  }}
                />
              </div>
              <div className="truncate min-w-0">
                <div className="flex items-center space-x-1.5 truncate">
                  <span className="font-medium text-zinc-100 text-xs truncate" title={currentTrack.title}>
                    {currentTrack.title}
                  </span>
                  {currentTrack.isFavorite && (
                    <Star size={10} className="text-yellow-400 fill-yellow-400 shrink-0" />
                  )}
                </div>
                <p className="text-zinc-400 text-[10.5px] sm:text-[11px] truncate mt-0.5" title={currentTrack.artistName}>
                  {currentTrack.artistName}
                </p>
              </div>
            </>
          ) : (
            <div className="text-zinc-500 text-[11px] font-mono flex items-center space-x-1.5">
              <span className="w-2 h-2 rounded-full bg-zinc-700 animate-pulse" />
              <span>No audio loaded</span>
            </div>
          )}
        </div>

        {/* Mobile Right Controls Cluster: Always visible, prominent buttons */}
        <div className="sm:hidden flex items-center space-x-1 shrink-0">
          <button
            onClick={toggleShuffle}
            title={isShuffle ? 'Shuffle On' : 'Shuffle Off'}
            className={`p-1.5 rounded transition ${isShuffle ? 'text-crimson-400' : 'text-zinc-500'}`}
          >
            <Shuffle size={14} />
          </button>

          <button
            onClick={previous}
            title="Previous Track"
            className="p-1.5 rounded text-zinc-300 active:scale-90 transition"
          >
            <SkipBack size={17} />
          </button>

          <button
            onClick={togglePlay}
            title={isPlaying ? 'Pause' : 'Play'}
            className="p-2.5 rounded-full bg-crimson-700 hover:bg-crimson-600 text-white shadow-lg active:scale-95 transition"
          >
            {isPlaying ? (
              <Pause size={17} className="fill-white" />
            ) : (
              <Play size={17} className="fill-white translate-x-0.5" />
            )}
          </button>

          <button
            onClick={next}
            title="Next Track"
            className="p-1.5 rounded text-zinc-300 active:scale-90 transition"
          >
            <SkipForward size={17} />
          </button>

          <button
            onClick={toggleRepeat}
            title={`Repeat: ${repeatMode}`}
            className={`p-1.5 rounded transition ${repeatMode !== 'off' ? 'text-crimson-400' : 'text-zinc-500'}`}
          >
            {repeatMode === 'one' ? <Repeat1 size={14} /> : <Repeat size={14} />}
          </button>

          <button
            onClick={() => setEqualizerOpen(!isEqualizerOpen)}
            title="Equalizer"
            className={`p-1.5 rounded transition ${
              isEqualizerOpen ? 'text-crimson-400 bg-charcoal-800' : 'text-zinc-400 hover:bg-charcoal-800'
            }`}
          >
            <Sliders size={15} />
          </button>

          <button
            onClick={() => {
              if (!rightPanelOpen) toggleRightPanel();
              setRightPanelTab('queue');
            }}
            title={`Queue (${queue.length} tracks)`}
            className={`p-1.5 rounded transition ${
              rightPanelOpen ? 'text-crimson-400 bg-charcoal-800' : 'text-zinc-400 hover:bg-charcoal-800'
            }`}
          >
            <ListMusic size={17} />
          </button>
        </div>

        {/* Desktop Center: Controls and Seek Slider */}
        <div className="hidden sm:flex flex-col items-center flex-1 max-w-xl mx-3 shrink-0">
          {/* Buttons */}
          <div className="flex items-center space-x-4 mb-1">
            <button
              onClick={toggleShuffle}
              title={isShuffle ? 'Shuffle On' : 'Shuffle Off'}
              className={`p-1 rounded transition ${isShuffle ? 'text-crimson-400' : 'text-zinc-500 hover:text-zinc-300'}`}
            >
              <Shuffle size={13} />
            </button>

            <button
              onClick={previous}
              title="Previous Track"
              className="p-1 rounded text-zinc-300 hover:text-white transition active:scale-95"
            >
              <SkipBack size={15} />
            </button>

            <button
              onClick={togglePlay}
              title={isPlaying ? 'Pause' : 'Play'}
              className="p-2.5 rounded-full bg-crimson-700 hover:bg-crimson-600 text-white shadow-lg transition active:scale-95"
            >
              {isPlaying ? <Pause size={15} className="fill-white" /> : <Play size={15} className="fill-white translate-x-0.5" />}
            </button>

            <button
              onClick={next}
              title="Next Track"
              className="p-1 rounded text-zinc-300 hover:text-white transition active:scale-95"
            >
              <SkipForward size={15} />
            </button>

            <button
              onClick={toggleRepeat}
              title={`Repeat: ${repeatMode}`}
              className={`p-1 rounded transition ${repeatMode !== 'off' ? 'text-crimson-400' : 'text-zinc-500 hover:text-zinc-300'}`}
            >
              {repeatMode === 'one' ? <Repeat1 size={14} /> : <Repeat size={14} />}
            </button>
          </div>

          {/* Desktop Seekbar */}
          <div className="flex w-full items-center space-x-2 text-[10.5px] font-mono text-zinc-400">
            <span className="w-9 text-right">{formatTime(currentPos)}</span>

            <div className="relative flex-1 flex items-center h-4 cursor-pointer group">
              <div className="w-full h-1 bg-charcoal-800 rounded-full overflow-hidden relative">
                <div
                  style={{ width: `${bufferedPercent}%` }}
                  className="absolute top-0 bottom-0 left-0 bg-charcoal-700 transition-all duration-300"
                />
                <div
                  style={{ width: `${progressPercent}%` }}
                  className="absolute top-0 bottom-0 left-0 bg-crimson-600 group-hover:bg-crimson-500"
                />
              </div>

              <input
                type="range"
                min={0}
                max={effectiveDuration || 1}
                step={0.1}
                value={currentPos}
                onChange={(e) => {
                  setIsSeeking(true);
                  setSeekValue(parseFloat(e.target.value));
                }}
                onMouseUp={() => handleSeekCommit(seekValue)}
                onTouchEnd={() => handleSeekCommit(seekValue)}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              />
            </div>

            <span className="w-9">{formatTime(effectiveDuration)}</span>
          </div>
        </div>

        {/* Desktop Right: Audio Quality, Volume & Drawer Toggles */}
        <div className="hidden sm:flex items-center space-x-3 shrink-0 w-1/4 justify-end min-w-[170px]">
          {/* Stream Quality Tag */}
          {currentTrack && (
            <button
              onClick={() => setForceTranscode(!forceTranscode)}
              title={forceTranscode ? 'Transcoded MP3 320k (Click for Direct)' : 'Direct Native Stream (Click to Transcode)'}
              className={`hidden md:inline-block font-mono text-[9px] px-1.5 py-0.5 rounded border transition ${
                forceTranscode
                  ? 'bg-charcoal-800 text-amber-400 border-amber-900/60'
                  : 'bg-charcoal-850 text-zinc-400 border-charcoal-750 hover:text-zinc-200'
              }`}
            >
              {forceTranscode ? 'TRANSCODED' : currentTrack.isLossless ? 'DIRECT • FLAC' : 'DIRECT'}
            </button>
          )}

          {/* Volume Slider */}
          <div className="hidden md:flex items-center space-x-1.5 group">
            <button
              onClick={toggleMute}
              className="p-1 text-zinc-400 hover:text-zinc-200 transition"
            >
              {isMuted || volume === 0 ? <VolumeX size={15} /> : <Volume2 size={15} />}
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={isMuted ? 0 : volume}
              onChange={(e) => setVolume(parseFloat(e.target.value))}
              className="w-16 h-1 bg-charcoal-800 accent-crimson-600 rounded cursor-pointer"
            />
          </div>

          {/* Equalizer Toggle Button */}
          <button
            onClick={() => setEqualizerOpen(!isEqualizerOpen)}
            title="10-Band Graphic Equalizer"
            className={`p-2 rounded transition ${
              isEqualizerOpen ? 'text-crimson-400 bg-charcoal-800' : 'text-zinc-400 hover:bg-charcoal-800'
            }`}
          >
            <Sliders size={16} />
          </button>

          {/* Queue Toggle Button */}
          <button
            onClick={() => {
              if (!rightPanelOpen) toggleRightPanel();
              setRightPanelTab('queue');
            }}
            title={`Queue (${queue.length} tracks)`}
            className={`p-2 rounded transition ${
              rightPanelOpen ? 'text-crimson-400 bg-charcoal-800' : 'text-zinc-400 hover:bg-charcoal-800'
            }`}
          >
            <ListMusic size={17} />
          </button>
        </div>
      </div>
    </footer>
  );
};
