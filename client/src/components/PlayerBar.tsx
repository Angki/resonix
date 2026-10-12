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
  Waves,
  Radio,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { usePlayerStore } from '../store/playerStore';
import { useUiStore } from '../store/uiStore';
import { useEqualizerStore, EQ_FREQUENCIES_10 } from '../store/equalizerStore';
import { useVisualizerStore } from '../store/visualizerStore';
import { audioVisualizerService } from '../services/audioVisualizerService';
import { api } from '../api/client';
import { PlayerContextMenu } from './PlayerContextMenu';


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
    listenedSeconds,
  } = usePlayerStore();

  const {
    rightPanelOpen,
    toggleRightPanel,
    setRightPanelTab,
    isEqualizerOpen,
    setEqualizerOpen,
    setMobileNowPlayingOpen,
  } = useUiStore();

  const {
    isEnabled: isEqEnabled,
    gains: eqGains,
    preAmp: eqPreAmp,
    isNormalizerEnabled,
  } = useEqualizerStore();
  const { isOpen: isVisualizerOpen, toggleOpen: toggleVisualizer } = useVisualizerStore();

  // Last.fm status query for live scrobble feedback
  const { data: lastFmStatus } = useQuery({
    queryKey: ['lastFmStatus'],
    queryFn: () => api.getLastFmStatus(),
    staleTime: 30000,
  });

  const [isSeeking, setIsSeeking] = useState(false);
  const [seekValue, setSeekValue] = useState(0);
  const [isScrobbled, setIsScrobbled] = useState(false);
  const [playerContextMenuPos, setPlayerContextMenuPos] = useState<{ x: number; y: number } | null>(null);

  const lastTrackIdRef = useRef<string | null>(null);
  const lastTimeRef = useRef<number>(0);
  const listenedSinceLastReportRef = useRef<number>(0);
  const isAdvancingRef = useRef<boolean>(false);
  const thresholdReportedRef = useRef<boolean>(false);

  // Reliable flush on tab close/unload
  useEffect(() => {
    const handleBeforeUnload = () => {
      const trackId = lastTrackIdRef.current;
      const sessId = usePlayerStore.getState().sessionId;
      const listened = usePlayerStore.getState().listenedSeconds;
      if (trackId && sessId && listened > 0) {
        navigator.sendBeacon?.(
          '/api/playback/progress',
          new Blob([JSON.stringify({
            trackId,
            sessionId: sessId,
            listenedSeconds: listened,
            eventId: crypto.randomUUID(),
          })], { type: 'application/json' })
        );
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  // Web Audio API equalizer, normalizer & visualizer nodes
  const audioCtxRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<MediaElementAudioSourceNode | null>(null);
  const preAmpGainRef = useRef<GainNode | null>(null);
  const filtersRef = useRef<BiquadFilterNode[]>([]);
  const compressorRef = useRef<DynamicsCompressorNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);

  // Setup Web Audio API filter chain, compressor & analyser node
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

            // Pre-amp gain node
            const preAmpNode = ctx.createGain();
            preAmpGainRef.current = preAmpNode;

            // 10-band peaking filters
            const filters: BiquadFilterNode[] = EQ_FREQUENCIES_10.map((freq, i) => {
              const filter = ctx.createBiquadFilter();
              if (i === 0) {
                filter.type = 'lowshelf';
              } else if (i === EQ_FREQUENCIES_10.length - 1) {
                filter.type = 'highshelf';
              } else {
                filter.type = 'peaking';
                filter.Q.value = 1.4;
              }
              filter.frequency.value = freq;
              filter.gain.value = 0;
              return filter;
            });

            // Audio Dynamics Compressor (Volume Normalizer & Peak Limiter)
            const compressor = ctx.createDynamicsCompressor();
            const initialNorm = useEqualizerStore.getState().isNormalizerEnabled;
            if (initialNorm) {
              compressor.threshold.value = -24;
              compressor.knee.value = 30;
              compressor.ratio.value = 12;
              compressor.attack.value = 0.003;
              compressor.release.value = 0.25;
            } else {
              compressor.threshold.value = 0;
              compressor.knee.value = 0;
              compressor.ratio.value = 1;
            }
            compressorRef.current = compressor;

            // Analyser node for visualizer (512 fftSize, 0.8 smoothing)
            const analyser = ctx.createAnalyser();
            analyser.fftSize = 512;
            analyser.smoothingTimeConstant = 0.8;
            analyserRef.current = analyser;
            audioVisualizerService.setAnalyser(analyser);

            // Chain: src -> preAmp -> filter[0] -> ... -> filter[9] -> compressor -> analyser -> destination
            let prevNode: AudioNode = srcNode;
            prevNode.connect(preAmpNode);
            prevNode = preAmpNode;

            filters.forEach((f) => {
              prevNode.connect(f);
              prevNode = f;
            });

            prevNode.connect(compressor);
            compressor.connect(analyser);
            analyser.connect(ctx.destination);
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

  // Update Pre-amp gain
  useEffect(() => {
    const ctx = audioCtxRef.current;
    const preAmpNode = preAmpGainRef.current;
    if (!ctx || !preAmpNode) return;

    const targetFactor = isEqEnabled ? Math.pow(10, eqPreAmp / 20) : 1;
    try {
      preAmpNode.gain.setTargetAtTime(targetFactor, ctx.currentTime, 0.05);
    } catch {
      preAmpNode.gain.value = targetFactor;
    }
  }, [isEqEnabled, eqPreAmp]);

  // Update Dynamics Compressor (Volume Normalizer)
  useEffect(() => {
    const ctx = audioCtxRef.current;
    const comp = compressorRef.current;
    if (!ctx || !comp) return;

    const t = ctx.currentTime;
    try {
      if (isNormalizerEnabled) {
        comp.threshold.setTargetAtTime(-24, t, 0.05);
        comp.ratio.setTargetAtTime(12, t, 0.05);
        comp.knee.setTargetAtTime(30, t, 0.05);
        comp.attack.setTargetAtTime(0.003, t, 0.05);
        comp.release.setTargetAtTime(0.25, t, 0.05);
      } else {
        comp.threshold.setTargetAtTime(0, t, 0.05);
        comp.ratio.setTargetAtTime(1, t, 0.05);
        comp.knee.setTargetAtTime(0, t, 0.05);
      }
    } catch {
      if (isNormalizerEnabled) {
        comp.threshold.value = -24;
        comp.ratio.value = 12;
        comp.knee.value = 30;
        comp.attack.value = 0.003;
        comp.release.value = 0.25;
      } else {
        comp.threshold.value = 0;
        comp.ratio.value = 1;
        comp.knee.value = 0;
      }
    }
  }, [isNormalizerEnabled]);


  // Sync audio element with currentTrack
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !currentTrack) return;

    if (lastTrackIdRef.current !== currentTrack.id) {
      // Flush outgoing track listening progress before switching
      const prevTrackId = lastTrackIdRef.current;
      const prevSessionId = usePlayerStore.getState().sessionId;
      const prevListened = usePlayerStore.getState().listenedSeconds;
      if (prevTrackId && prevSessionId && prevListened > 0) {
        api.reportProgress({
          trackId: prevTrackId,
          sessionId: prevSessionId,
          listenedSeconds: prevListened,
          eventId: crypto.randomUUID(),
        }).catch(err => console.warn('Outgoing track progress flush failed:', err));
      }

      lastTrackIdRef.current = currentTrack.id;
      lastTimeRef.current = 0;
      listenedSinceLastReportRef.current = 0;
      thresholdReportedRef.current = false;
      setIsScrobbled(false);
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

  // Handle actual listening time accumulation, watchdog near-end check, and backend reporting
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

        const currentListened = usePlayerStore.getState().listenedSeconds;
        const currentSessionId = usePlayerStore.getState().sessionId;
        const effDuration = audio.duration || currentTrack.duration || 0;
        const scrobbleThreshold = Math.min(effDuration * 0.5, 240);
        const isEligible = effDuration >= 30;

        // Instant threshold reporting: the exact second threshold (50% or 240s) is crossed!
        if (isEligible && currentListened >= scrobbleThreshold && !thresholdReportedRef.current && currentSessionId) {
          thresholdReportedRef.current = true;
          setIsScrobbled(true);
          api.reportProgress({
            trackId: currentTrack.id,
            sessionId: currentSessionId,
            listenedSeconds: currentListened,
            eventId: crypto.randomUUID(),
          }).then(res => {
            if (res.thresholdReached || res.isCompleted) {
              setIsScrobbled(true);
            }
          }).catch(e => {
            console.warn('Instant scrobble progress report failed:', e);
            thresholdReportedRef.current = false;
          });
          listenedSinceLastReportRef.current = 0;
        } else if (listenedSinceLastReportRef.current >= 15) {
          // Periodic heartbeat every 15 seconds
          if (currentSessionId) {
            api.reportProgress({
              trackId: currentTrack.id,
              sessionId: currentSessionId,
              listenedSeconds: currentListened,
              eventId: crypto.randomUUID(),
            }).then(res => {
              if (res.thresholdReached || res.isCompleted) {
                setIsScrobbled(true);
                thresholdReportedRef.current = true;
              }
            }).catch(e => console.warn('Progress report failed:', e));
          }
          listenedSinceLastReportRef.current = 0;
        }
      }
    }
    lastTimeRef.current = cur;

    // Keep MediaSession position state strictly synced to prevent OS background notification drops
    if ('mediaSession' in navigator && 'setPositionState' in navigator.mediaSession) {
      const effDuration = audio.duration || currentTrack.duration;
      if (effDuration && isFinite(effDuration) && effDuration > 0) {
        try {
          navigator.mediaSession.setPositionState({
            duration: effDuration,
            playbackRate: audio.playbackRate || 1,
            position: Math.min(Math.max(0, cur), effDuration),
          });
        } catch {
          // ignore transient position timing discrepancies
        }
      }
    }

    // Near-end watchdog: HTML5 audio streaming over HTTP 206 sometimes stalls or misses onended
    // when duration metadata has a floating-point delta with decoded stream samples.
    // Trigger auto-advance reliably when within 0.75s of actual audio duration while still actively playing.
    const actualDur = audio.duration;
    if (
      actualDur &&
      isFinite(actualDur) &&
      actualDur > 2 &&
      cur >= actualDur - 0.75 &&
      !audio.paused &&
      !isSeeking &&
      !isAdvancingRef.current
    ) {
      console.log(`[PlayerBar] Near-end watchdog auto-advancing at ${cur.toFixed(1)}s / ${actualDur.toFixed(1)}s`);
      handleEnded();
    }
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
    // Mutex guard against double-advance from both onended and timeupdate watchdog
    if (isAdvancingRef.current) return;
    isAdvancingRef.current = true;
    setTimeout(() => {
      isAdvancingRef.current = false;
    }, 1200);

    const audio = audioRef.current;
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
      if (audio) {
        audio.currentTime = 0;
        audio.play().catch(e => console.warn('Repeat play failed:', e));
      }
      return;
    }

    const { queue, queueIndex, isShuffle, repeatMode: rMode } = usePlayerStore.getState();
    if (queue.length === 0) return;

    // Verify current index directly against currentTrack.id to avoid stale index drift
    let currentIndex = queueIndex;
    if (currentTrack) {
      const actualIdx = queue.findIndex(t => t.id === currentTrack.id);
      if (actualIdx !== -1) currentIndex = actualIdx;
    }

    let nextIndex = currentIndex + 1;
    if (isShuffle) {
      if (queue.length > 1) {
        let rand = Math.floor(Math.random() * queue.length);
        if (rand === currentIndex) rand = (rand + 1) % queue.length;
        nextIndex = rand;
      } else {
        nextIndex = 0;
      }
    } else if (nextIndex >= queue.length) {
      if (rMode === 'all') {
        nextIndex = 0;
      } else {
        console.log('[PlayerBar] End of queue reached, stopping playback');
        usePlayerStore.setState({ isPlaying: false, currentTime: 0 });
        thresholdReportedRef.current = false;
        setIsScrobbled(false);
        if ('mediaSession' in navigator) {
          navigator.mediaSession.playbackState = 'none';
        }
        return;
      }
    }

    const nextTrack = queue[nextIndex];
    if (nextTrack && audio) {
      console.log(`[PlayerBar] Auto-advancing to: "${nextTrack.title}" (${nextIndex + 1}/${queue.length})`);

      // 1. Synchronously set audio.src and start playback immediately in the native onended callback.
      // This preserves user gesture continuity so background tabs never get blocked by browser autoplay policy.
      lastTrackIdRef.current = nextTrack.id;
      lastTimeRef.current = 0;
      listenedSinceLastReportRef.current = 0;
      thresholdReportedRef.current = false;
      setIsScrobbled(false);
      resetListenedSeconds();

      const streamUrl = api.getStreamUrl(nextTrack.id, forceTranscode);
      audio.src = streamUrl;
      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise.catch((err) => {
          if (err.name !== 'AbortError') {
            console.warn('[PlayerBar] Background auto-advance play error:', err);
          }
        });
      }

      // 2. Synchronously refresh MediaSession metadata to retain browser notification controls
      if ('mediaSession' in navigator) {
        const artworkUrl = api.getTrackArtworkUrl(nextTrack.id, 512);
        navigator.mediaSession.metadata = new MediaMetadata({
          title: nextTrack.title,
          artist: nextTrack.artistName,
          album: nextTrack.albumTitle || 'Unknown Album',
          artwork: [
            { src: artworkUrl, sizes: '512x512', type: 'image/webp' },
            { src: artworkUrl, sizes: '256x256', type: 'image/webp' },
          ],
        });
        navigator.mediaSession.playbackState = 'playing';
      }

      // 3. Update Zustand store
      usePlayerStore.setState({
        queueIndex: nextIndex,
        currentTrack: nextTrack,
        isPlaying: true,
        currentTime: 0,
        duration: nextTrack.duration,
        sessionId: null,
        listenedSeconds: 0,
      });

      // 4. Start backend playback tracking session
      api.startPlayback(nextTrack.id).then((res) => {
        setSessionId(res.sessionId);
      }).catch(err => console.error('Failed to start playback session:', err));
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

  const scrobbleThreshold = Math.min(effectiveDuration * 0.5, 240);
  const isScrobbleEligible = effectiveDuration >= 30;
  const remainingScrobbleSec = Math.max(0, Math.ceil(scrobbleThreshold - listenedSeconds));
  const scrobblePercent = scrobbleThreshold > 0 ? Math.min(100, Math.round((listenedSeconds / scrobbleThreshold) * 100)) : 0;

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
        onEnded={() => {
          console.log('[PlayerBar] Native onEnded fired -> advancing');
          handleEnded();
        }}
        onPause={() => {
          const audio = audioRef.current;
          if (audio && currentTrack && !isSeeking && !isAdvancingRef.current) {
            const actualDur = audio.duration;
            if (audio.ended || (actualDur && isFinite(actualDur) && actualDur > 2 && audio.currentTime >= actualDur - 0.75)) {
              console.log(`[PlayerBar] EOF pause detected at ${audio.currentTime.toFixed(1)}s -> handleEnded()`);
              handleEnded();
            }
          }
        }}
        onError={(e) => {
          console.warn('Audio element error:', e);
          if (!forceTranscode && currentTrack) {
            console.log('Direct playback failed, switching to transcode fallback...');
            setForceTranscode(true);
          } else {
            console.warn('Track unplayable or stream interrupted, auto-advancing to next track in queue...');
            setTimeout(() => {
              handleEnded();
            }, 1000);
          }
        }}
      />

      {/* Mobile Top Edge: Scrub bar with explicit time display */}
      <div className="sm:hidden px-2 pt-1.5 pb-0.5 flex flex-col w-full bg-charcoal-950/95 border-b border-charcoal-850/60">
        <div className="flex items-center justify-between text-[10px] font-mono text-zinc-400 mb-0.5">
          <span className="w-8 text-left">{formatTime(currentPos)}</span>
          <span
            onClick={() => { if (currentTrack) setMobileNowPlayingOpen(true); }}
            className="text-zinc-300 font-sans truncate px-2 text-center text-[10.5px] cursor-pointer active:text-crimson-400 hover:text-white transition"
          >
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
        <div
          onContextMenu={(e) => {
            if (currentTrack) {
              e.preventDefault();
              setPlayerContextMenuPos({ x: e.clientX, y: e.clientY });
            }
          }}
          onClick={() => {
            if (window.innerWidth < 640 && currentTrack) {
              setMobileNowPlayingOpen(true);
            }
          }}
          title={currentTrack ? `${currentTrack.artistName} - ${currentTrack.title} (Right-click for options)` : undefined}
          className="flex items-center space-x-2 sm:space-x-3 flex-1 sm:flex-initial sm:w-1/4 sm:min-w-[170px] max-w-[48%] sm:max-w-none truncate sm:cursor-default cursor-pointer group/mobiletrack select-none"
        >
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
                  {lastFmStatus?.isConnected && lastFmStatus?.isScrobblingEnabled && (
                    <div className="shrink-0 flex items-center ml-1">
                      {isScrobbled ? (
                        <span
                          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[8.5px] font-mono font-semibold bg-red-950/60 text-red-400 border border-red-750/60 shadow-sm"
                          title="✓ Track scrobbled to Last.fm"
                        >
                          <Radio size={8} className="text-red-500 animate-pulse" />
                          <span>SCROBBLED</span>
                        </span>
                      ) : !isScrobbleEligible ? (
                        <span
                          className="inline-flex items-center px-1.5 py-0.5 rounded text-[8.5px] font-mono text-zinc-500 bg-charcoal-900 border border-charcoal-800"
                          title="Track <30s (ineligible for Last.fm scrobble)"
                        >
                          &lt;30s
                        </span>
                      ) : (
                        <span
                          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[8.5px] font-mono text-zinc-400 bg-charcoal-900 border border-charcoal-800"
                          title={`Scrobbles to Last.fm at 50% (${remainingScrobbleSec}s remaining • ${scrobblePercent}%)`}
                        >
                          <Radio size={8} className="text-zinc-500" />
                          <span>{remainingScrobbleSec}s</span>
                        </span>
                      )}
                    </div>
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
            onClick={toggleVisualizer}
            title="Audio Visualizer (V)"
            className={`p-1.5 rounded transition ${
              isVisualizerOpen ? 'text-crimson-400 bg-charcoal-800' : 'text-zinc-400 hover:bg-charcoal-800'
            }`}
          >
            <Waves size={15} />
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

          {/* Last.fm Scrobble Pill */}
          {currentTrack && lastFmStatus?.isConnected && lastFmStatus?.isScrobblingEnabled && (
            <div className="hidden lg:flex items-center">
              {isScrobbled ? (
                <div
                  className="flex items-center gap-1.5 px-2 py-0.5 rounded font-mono text-[9px] bg-red-950/40 text-red-400 border border-red-800/60 shadow-sm"
                  title={`Track scrobbled to Last.fm (${lastFmStatus.username})`}
                >
                  <Radio size={9} className="text-red-500 animate-pulse" />
                  <span>LAST.FM SCROBBLED</span>
                </div>
              ) : isScrobbleEligible ? (
                <div
                  className="flex items-center gap-1.5 px-2 py-0.5 rounded font-mono text-[9px] bg-charcoal-850 text-zinc-400 border border-charcoal-750"
                  title={`Scrobbles to Last.fm at 50% (${remainingScrobbleSec}s remaining • ${scrobblePercent}%)`}
                >
                  <Radio size={9} className="text-zinc-500" />
                  <span>SCROBBLE: {remainingScrobbleSec}s</span>
                </div>
              ) : null}
            </div>
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
            title="Parametric Graphic Equalizer"
            className={`p-2 rounded transition ${
              isEqualizerOpen ? 'text-crimson-400 bg-charcoal-800' : 'text-zinc-400 hover:bg-charcoal-800'
            }`}
          >
            <Sliders size={16} />
          </button>

          {/* Audio Visualizer Toggle Button */}
          <button
            onClick={toggleVisualizer}
            title="Audio Visualizer (V)"
            className={`p-2 rounded transition ${
              isVisualizerOpen ? 'text-crimson-400 bg-charcoal-800' : 'text-zinc-400 hover:bg-charcoal-800'
            }`}
          >
            <Waves size={16} />
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

      {/* Track Context Menu (Right click on playing track info) */}
      {playerContextMenuPos && currentTrack && (
        <PlayerContextMenu
          x={playerContextMenuPos.x}
          y={playerContextMenuPos.y}
          track={currentTrack}
          onClose={() => setPlayerContextMenuPos(null)}
        />
      )}
    </footer>
  );
};
