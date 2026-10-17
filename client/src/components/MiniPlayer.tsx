import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
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
  X,
  Maximize2,
  Disc3,
} from 'lucide-react';
import { usePlayerStore } from '../store/playerStore';
import { useUiStore } from '../store/uiStore';
import { api } from '../api/client';
import { audioVisualizerService } from '../services/audioVisualizerService';

function formatTime(sec: number): string {
  if (!sec || isNaN(sec) || !isFinite(sec) || sec <= 0) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

interface MiniPlayerViewProps {
  onClose: () => void;
  isPipWindow?: boolean;
}

export const MiniPlayerView: React.FC<MiniPlayerViewProps> = ({ onClose, isPipWindow = false }) => {
  const {
    currentTrack,
    isPlaying,
    currentTime,
    duration,
    togglePlay,
    next,
    previous,
    seek,
    volume,
    setVolume,
    isMuted,
    toggleMute,
    repeatMode,
    toggleRepeat,
    isShuffle,
    toggleShuffle,
    forceTranscode,
  } = usePlayerStore();

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const effectiveDuration =
    duration && isFinite(duration) && duration > 0
      ? duration
      : currentTrack?.duration && isFinite(currentTrack.duration) && currentTrack.duration > 0
      ? currentTrack.duration
      : 0;
  const progressPercent = effectiveDuration > 0 ? (currentTime / effectiveDuration) * 100 : 0;

  // Render mini audio visualizer waves
  useEffect(() => {
    let animId: number;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const render = () => {
      animId = requestAnimationFrame(render);
      const width = canvas.width;
      const height = canvas.height;
      ctx.clearRect(0, 0, width, height);

      const freqData = audioVisualizerService.getFrequencyData();
      if (!freqData || !isPlaying) {
        // Draw resting subtle line
        ctx.strokeStyle = 'rgba(161, 161, 170, 0.2)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(0, height / 2);
        ctx.lineTo(width, height / 2);
        ctx.stroke();
        return;
      }

      const barCount = 28;
      const step = Math.floor(freqData.length / barCount);
      const barWidth = width / barCount - 1.5;

      for (let i = 0; i < barCount; i++) {
        const val = freqData[i * step] || 0;
        const barHeight = Math.max(2, (val / 255) * (height - 4));
        const x = i * (barWidth + 1.5);
        const y = height - barHeight;

        // Gradient from crimson to amber
        const grad = ctx.createLinearGradient(0, y, 0, height);
        grad.addColorStop(0, '#e11d48');
        grad.addColorStop(1, '#9f1239');

        ctx.fillStyle = grad;
        ctx.fillRect(x, y, barWidth, barHeight);
      }
    };

    render();
    return () => cancelAnimationFrame(animId);
  }, [isPlaying]);

  return (
    <div className={`flex flex-col h-full w-full bg-charcoal-950 text-zinc-100 select-none overflow-hidden font-sans ${isPipWindow ? 'p-3' : 'p-3.5'}`}>
      {/* Top Header */}
      <div className="flex items-center justify-between pb-2 border-b border-charcoal-800/80 mb-2.5">
        <div className="flex items-center space-x-1.5 text-zinc-400">
          <Disc3 size={15} className={`text-crimson-500 ${isPlaying ? 'animate-spin' : ''}`} style={{ animationDuration: '4s' }} />
          <span className="font-mono text-[10px] font-bold tracking-wider text-zinc-300 uppercase">
            Resonix • Mini
          </span>
        </div>
        <div className="flex items-center space-x-1">
          {currentTrack && (
            <span className="font-mono text-[9px] px-1.5 py-0.5 rounded bg-charcoal-850 text-zinc-400 border border-charcoal-750">
              {forceTranscode ? 'MP3 320k' : currentTrack.isLossless ? 'FLAC' : (currentTrack.codec || 'DIRECT').toUpperCase()}
            </span>
          )}
          <button
            onClick={onClose}
            title="Close Mini-Player"
            className="p-1 rounded text-zinc-400 hover:text-white hover:bg-charcoal-800 transition"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Album Artwork & Ambient Card */}
      <div className="relative flex-1 flex flex-col items-center justify-center min-h-0 my-1">
        <div className="relative group w-36 h-36 sm:w-40 sm:h-40 rounded-xl overflow-hidden shadow-2xl border border-charcoal-750/80 bg-charcoal-900 flex-shrink-0">
          {currentTrack ? (
            <img
              src={api.getArtworkUrl(currentTrack.artworkId, 256)}
              alt={currentTrack.albumTitle}
              className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-zinc-600">
              <Disc3 size={48} />
            </div>
          )}
          {isPlaying && (
            <div className="absolute top-2 right-2 flex items-center space-x-0.5 bg-black/60 backdrop-blur-md px-1.5 py-0.5 rounded-full border border-white/10">
              <span className="w-1.5 h-1.5 rounded-full bg-crimson-500 animate-pulse" />
              <span className="text-[9px] font-mono text-zinc-300 font-bold ml-1">LIVE</span>
            </div>
          )}
        </div>

        {/* Track Title & Artist */}
        <div className="w-full text-center mt-3 px-1">
          <div className="font-semibold text-zinc-100 text-sm truncate" title={currentTrack?.title || 'No Audio'}>
            {currentTrack?.title || 'No Track Selected'}
          </div>
          <div className="text-zinc-400 text-xs truncate mt-0.5" title={currentTrack?.artistName || ''}>
            {currentTrack?.artistName || 'Select a track to play'}
          </div>
          <div className="text-zinc-500 text-[10px] truncate mt-0.5" title={currentTrack?.albumTitle || ''}>
            {currentTrack?.albumTitle || ''}
          </div>
        </div>
      </div>

      {/* Mini Visualizer Canvas */}
      <div className="w-full h-6 my-1.5 rounded overflow-hidden bg-charcoal-900/60 border border-charcoal-800/60 flex items-center justify-center px-1">
        <canvas ref={canvasRef} width={280} height={24} className="w-full h-full block" />
      </div>

      {/* Progress Slider */}
      <div className="w-full flex flex-col space-y-1 mb-2">
        <div className="relative flex items-center h-3 cursor-pointer group">
          <div className="w-full h-1 bg-charcoal-800 rounded-full overflow-hidden relative">
            <div
              style={{ width: `${progressPercent}%` }}
              className="absolute inset-y-0 left-0 bg-crimson-600 group-hover:bg-crimson-500 transition-all"
            />
          </div>
          <input
            type="range"
            min={0}
            max={effectiveDuration || 1}
            step={0.5}
            value={currentTime}
            onChange={(e) => seek(parseFloat(e.target.value))}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          />
        </div>
        <div className="flex items-center justify-between text-[10px] font-mono text-zinc-400 px-0.5">
          <span>{formatTime(currentTime)}</span>
          <span>{formatTime(effectiveDuration)}</span>
        </div>
      </div>

      {/* Main Playback Controls */}
      <div className="flex items-center justify-between w-full pt-1">
        <button
          onClick={toggleShuffle}
          title={`Shuffle: ${isShuffle ? 'On' : 'Off'}`}
          className={`p-1.5 rounded transition ${isShuffle ? 'text-crimson-400' : 'text-zinc-500 hover:text-zinc-300'}`}
        >
          <Shuffle size={14} />
        </button>

        <button
          onClick={previous}
          title="Previous Track"
          className="p-1.5 rounded text-zinc-300 hover:text-white hover:bg-charcoal-800 transition"
        >
          <SkipBack size={18} />
        </button>

        <button
          onClick={togglePlay}
          title={isPlaying ? 'Pause' : 'Play'}
          className="w-10 h-10 rounded-full bg-crimson-600 hover:bg-crimson-500 text-white flex items-center justify-center shadow-lg transition active:scale-95"
        >
          {isPlaying ? <Pause size={18} /> : <Play size={18} className="translate-x-0.5" />}
        </button>

        <button
          onClick={next}
          title="Next Track"
          className="p-1.5 rounded text-zinc-300 hover:text-white hover:bg-charcoal-800 transition"
        >
          <SkipForward size={18} />
        </button>

        <button
          onClick={toggleRepeat}
          title={`Repeat: ${repeatMode}`}
          className={`p-1.5 rounded transition ${repeatMode !== 'off' ? 'text-crimson-400' : 'text-zinc-500 hover:text-zinc-300'}`}
        >
          {repeatMode === 'one' ? <Repeat1 size={14} /> : <Repeat size={14} />}
        </button>
      </div>

      {/* Volume slider row */}
      <div className="flex items-center space-x-2 w-full pt-2 mt-1 border-t border-charcoal-850">
        <button
          onClick={toggleMute}
          title={isMuted ? 'Unmute' : 'Mute'}
          className="text-zinc-400 hover:text-zinc-200 transition"
        >
          {isMuted || volume === 0 ? <VolumeX size={14} /> : <Volume2 size={14} />}
        </button>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={isMuted ? 0 : volume}
          onChange={(e) => setVolume(parseFloat(e.target.value))}
          className="flex-1 h-1 bg-charcoal-800 accent-crimson-600 rounded cursor-pointer"
        />
        <span className="font-mono text-[9px] text-zinc-500 w-7 text-right">
          {Math.round((isMuted ? 0 : volume) * 100)}%
        </span>
      </div>
    </div>
  );
};

export const MiniPlayerContainer: React.FC = () => {
  const { isMiniPlayerOpen, setMiniPlayerOpen } = useUiStore();
  const pipWindowRef = useRef<Window | null>(null);
  const [pipBodyNode, setPipBodyNode] = useState<HTMLElement | null>(null);

  // Handle Document Picture-in-Picture window lifecycle
  useEffect(() => {
    if (!isMiniPlayerOpen) {
      if (pipWindowRef.current) {
        try {
          pipWindowRef.current.close();
        } catch {}
        pipWindowRef.current = null;
        setPipBodyNode(null);
      }
      return;
    }

    // Check if browser supports documentPictureInPicture
    const hasDocPip = typeof window !== 'undefined' && 'documentPictureInPicture' in window;

    if (hasDocPip && !pipWindowRef.current) {
      const openPip = async () => {
        try {
          const pipWin: Window = await (window as any).documentPictureInPicture.requestWindow({
            width: 360,
            height: 480,
          });
          pipWindowRef.current = pipWin;

          // Copy stylesheets so tailwind and custom CSS variables work identically
          document.querySelectorAll('link[rel="stylesheet"], style').forEach((node) => {
            try {
              pipWin.document.head.appendChild(node.cloneNode(true));
            } catch {}
          });

          pipWin.document.title = 'Resonix • Mini-Player';
          pipWin.document.body.className = 'bg-charcoal-950 text-zinc-100 m-0 p-0 overflow-hidden';

          pipWin.addEventListener('pagehide', () => {
            pipWindowRef.current = null;
            setPipBodyNode(null);
            setMiniPlayerOpen(false);
          });

          setPipBodyNode(pipWin.document.body);
        } catch (err) {
          console.warn('[MiniPlayer] Document PiP request failed, falling back to floating widget:', err);
          // Fallback to in-window floating widget
          setPipBodyNode(null);
        }
      };

      openPip();
    }
  }, [isMiniPlayerOpen, setMiniPlayerOpen]);

  if (!isMiniPlayerOpen) return null;

  // Render in PiP Window if available
  if (pipBodyNode) {
    return createPortal(
      <MiniPlayerView
        onClose={() => {
          if (pipWindowRef.current) {
            pipWindowRef.current.close();
          }
          setMiniPlayerOpen(false);
        }}
        isPipWindow={true}
      />,
      pipBodyNode
    );
  }

  // Floating draggable fallback in current window
  return (
    <div className="fixed bottom-20 right-4 z-50 w-80 h-[440px] shadow-2xl rounded-2xl bg-charcoal-950/95 backdrop-blur-xl border border-charcoal-700/80 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
      <MiniPlayerView onClose={() => setMiniPlayerOpen(false)} isPipWindow={false} />
    </div>
  );
};
