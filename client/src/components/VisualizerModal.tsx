import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  Waves,
  X,
  Maximize2,
  Minimize2,
  Volume2,
  VolumeX,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  ChevronLeft,
  ChevronRight,
  Sliders,
  Sparkles,
  Image as ImageIcon,
  Eye,
  EyeOff,
  Music,
  RefreshCw,
  LayoutGrid,
  ChevronDown,
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useVisualizerStore, VISUALIZER_MODES, VisualizerTheme } from '../store/visualizerStore';
import { useUiStore } from '../store/uiStore';
import { usePlayerStore } from '../store/playerStore';
import { audioVisualizerService } from '../services/audioVisualizerService';
import { api } from '../api/client';

// Theme color definitions for Canvas gradients and glows
const THEMES: Record<
  VisualizerTheme,
  {
    name: string;
    primary: string;
    secondary: string;
    accent: string;
    glow: string;
    bgGlow: string;
    rgb: [number, number, number];
  }
> = {
  resonance: {
    name: 'Resonance Harmonic',
    primary: '#06b6d4',
    secondary: '#6366f1',
    accent: '#a5b4fc',
    glow: 'rgba(6, 182, 212, 0.55)',
    bgGlow: 'rgba(99, 102, 241, 0.22)',
    rgb: [6, 182, 212],
  },
  crimson: {
    name: 'Crimson Blood',
    primary: '#dc2626',
    secondary: '#991b1b',
    accent: '#f87171',
    glow: 'rgba(220, 38, 38, 0.45)',
    bgGlow: 'rgba(153, 27, 27, 0.15)',
    rgb: [220, 38, 38],
  },
  cyber: {
    name: 'Cyber Cyan',
    primary: '#06b6d4',
    secondary: '#0e7490',
    accent: '#67e8f9',
    glow: 'rgba(6, 182, 212, 0.45)',
    bgGlow: 'rgba(14, 116, 144, 0.15)',
    rgb: [6, 182, 212],
  },
  matrix: {
    name: 'Matrix Emerald',
    primary: '#10b981',
    secondary: '#047857',
    accent: '#6ee7b7',
    glow: 'rgba(16, 185, 129, 0.45)',
    bgGlow: 'rgba(4, 120, 87, 0.15)',
    rgb: [16, 185, 129],
  },
  abyss: {
    name: 'Abyssal Violet',
    primary: '#a855f7',
    secondary: '#7e22ce',
    accent: '#d8b4fe',
    glow: 'rgba(168, 85, 247, 0.45)',
    bgGlow: 'rgba(126, 34, 206, 0.15)',
    rgb: [168, 85, 247],
  },
  solar: {
    name: 'Solar Gold',
    primary: '#f59e0b',
    secondary: '#b45309',
    accent: '#fde68a',
    glow: 'rgba(245, 158, 11, 0.45)',
    bgGlow: 'rgba(180, 83, 9, 0.15)',
    rgb: [245, 158, 11],
  },
  silver: {
    name: 'Monochrome Silver',
    primary: '#e4e4e7',
    secondary: '#71717a',
    accent: '#ffffff',
    glow: 'rgba(228, 228, 231, 0.35)',
    bgGlow: 'rgba(113, 113, 122, 0.12)',
    rgb: [228, 228, 231],
  },
};

// Particles for starfield, flame, and ambient lyrics
interface Particle {
  x: number;
  y: number;
  z?: number;
  vx: number;
  vy: number;
  size: number;
  alpha: number;
  life: number;
  maxLife: number;
  color?: string;
}

export const VisualizerModal: React.FC = () => {
  const {
    isOpen,
    setOpen,
    mode,
    setMode,
    nextMode,
    prevMode,
    theme,
    setTheme,
    sensitivity,
    setSensitivity,
    showOverlay,
    toggleOverlay,
    isFullscreen,
    setIsFullscreen,
  } = useVisualizerStore();

  const {
    currentTrack,
    isPlaying,
    togglePlay,
    previous,
    next,
    volume,
    setVolume,
    isMuted,
    toggleMute,
    currentTime,
    duration,
    seek,
  } = usePlayerStore();

  const { visualizerAmbientBg, setVisualizerAmbientBg } = useUiStore();
  const ambientBgRef = useRef(visualizerAmbientBg);
  ambientBgRef.current = visualizerAmbientBg;
  const currentTrackRef = useRef(currentTrack);
  currentTrackRef.current = currentTrack;

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const animFrameIdRef = useRef<number | null>(null);

  // Auto-hide controls overlay on mouse inactivity
  const [isHoveringControls, setIsHoveringControls] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [isModePickerOpen, setIsModePickerOpen] = useState(false);
  const hideTimerRef = useRef<any>(null);

  // VU meter ballistic levels for Mode 12
  const vuMeterRef = useRef<{ left: number; right: number }>({ left: 0, right: 0 });

  useEffect(() => {
    if (isOpen) {
      setControlsVisible(true);
    }
  }, [isOpen]);

  // Cached Image object for Album Artwork (used in Mode 6 Vinyl, Mode 10 Album Art Pulse, and Mode 12 Audiophile Stage)
  const albumArtImgRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    const artworkSrc = currentTrack?.artworkId
      ? api.getArtworkUrl(currentTrack.artworkId, 512)
      : currentTrack?.id
      ? api.getTrackArtworkUrl(currentTrack.id, 512)
      : null;

    if (!artworkSrc) {
      albumArtImgRef.current = null;
      return;
    }

    const img = new Image();
    img.src = artworkSrc;
    img.onload = () => {
      albumArtImgRef.current = img;
    };
    img.onerror = () => {
      if (currentTrack?.id && artworkSrc !== api.getTrackArtworkUrl(currentTrack.id, 512)) {
        const fallback = new Image();
        fallback.src = api.getTrackArtworkUrl(currentTrack.id, 512);
        fallback.onload = () => {
          albumArtImgRef.current = fallback;
        };
      } else {
        albumArtImgRef.current = null;
      }
    };
  }, [currentTrack?.artworkId, currentTrack?.id]);

  // Query lyrics for Mode 11 (Live Synced Lyrics)
  const queryClient = useQueryClient();
  const { data: lyricsData, isLoading: lyricsLoading } = useQuery({
    queryKey: ['visualizerLyrics', currentTrack?.id],
    queryFn: () => (currentTrack?.id ? api.getTrackLyrics(currentTrack.id) : null),
    enabled: isOpen && mode === 11 && !!currentTrack?.id,
  });

  const refetchLyricsMutation = useMutation({
    mutationFn: () => (currentTrack?.id ? api.refetchTrackLyrics(currentTrack.id) : Promise.reject()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['visualizerLyrics', currentTrack?.id] });
    },
  });

  const activeLyricsLineRef = useRef<HTMLDivElement | null>(null);

  // Determine active lyrics line based on currentTime
  let activeLyricsIndex = -1;
  if (lyricsData?.isSynced && lyricsData.lines && lyricsData.lines.length > 0) {
    for (let i = lyricsData.lines.length - 1; i >= 0; i--) {
      if (currentTime >= lyricsData.lines[i].time - 0.25) {
        activeLyricsIndex = i;
        break;
      }
    }
  }

  // Smooth auto-scroll active lyrics line into vertical center
  useEffect(() => {
    if (activeLyricsIndex < 0 || !activeLyricsLineRef.current) return;
    activeLyricsLineRef.current.scrollIntoView({
      behavior: 'smooth',
      block: 'center',
    });
  }, [activeLyricsIndex]);

  // Visualizer states: peak hold bars, particle pool, matrix columns, vinyl rotation, shockwaves
  const peaksRef = useRef<number[]>([]);
  const peakDecayRef = useRef<number[]>([]);
  const particlesRef = useRef<Particle[]>([]);
  const matrixColsRef = useRef<{ y: number; speed: number; chars: string[] }[]>([]);
  const rotationRef = useRef<number>(0);
  const shockwaveRingsRef = useRef<{ radius: number; maxRadius: number; alpha: number }[]>([]);
  const gridOffsetRef = useRef<number>(0);

  const activeModeDef = VISUALIZER_MODES[mode] || VISUALIZER_MODES[0];
  const activeTheme = THEMES[theme] || THEMES.crimson;

  // Handle Fullscreen Toggle
  const toggleFullscreenNative = useCallback(() => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  }, [setIsFullscreen]);

  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, [setIsFullscreen]);

  // Handle Keyboard Shortcuts inside Visualizer
  useEffect(() => {
    if (!isOpen) return;

    const handleKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.key === 'Escape') {
        if (document.fullscreenElement) {
          document.exitFullscreen();
        } else {
          setOpen(false);
        }
      } else if (e.key === 'f' || e.key === 'F') {
        toggleFullscreenNative();
      } else if (e.key === 'h' || e.key === 'H') {
        toggleOverlay();
      } else if (e.key === 'ArrowRight') {
        nextMode();
      } else if (e.key === 'ArrowLeft') {
        prevMode();
      } else if (e.code === 'Space') {
        e.preventDefault();
        togglePlay();
      }
    };

    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, nextMode, prevMode, setOpen, toggleFullscreenNative, toggleOverlay, togglePlay]);

  // Handle Mouse Movement to reveal/hide overlay
  const handleMouseMove = () => {
    setControlsVisible(true);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    if (!isHoveringControls) {
      hideTimerRef.current = setTimeout(() => {
        setControlsVisible(false);
      }, 3500);
    }
  };

  // Main Canvas Rendering Loop
  useEffect(() => {
    if (!isOpen) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Resize canvas to match display size
    const resizeCanvas = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.scale(dpr, dpr);
    };

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    // Initialize particles
    if (particlesRef.current.length === 0) {
      const pCount = 120;
      for (let i = 0; i < pCount; i++) {
        particlesRef.current.push({
          x: (Math.random() - 0.5) * 800,
          y: (Math.random() - 0.5) * 800,
          z: Math.random() * 800,
          vx: (Math.random() - 0.5) * 0.8,
          vy: (Math.random() - 0.5) * 0.8,
          size: Math.random() * 2.5 + 1,
          alpha: Math.random(),
          life: 0,
          maxLife: 200,
        });
      }
    }

    const render = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const width = canvas.width / dpr;
      const height = canvas.height / dpr;

      // Get real audio data from WebAudio service
      const freqData = audioVisualizerService.getFrequencyData();
      const timeData = audioVisualizerService.getTimeDomainData();
      const energy = audioVisualizerService.getEnergyLevels();

      // Background clearing with ambient cover art transparency support
      const hasAmbientCover = ambientBgRef.current !== 'off' && !!currentTrackRef.current?.artworkId;
      if (hasAmbientCover) {
        ctx.clearRect(0, 0, width, height);
        ctx.fillStyle = ambientBgRef.current === 'cover-blur' ? 'rgba(5, 6, 9, 0.45)' : 'rgba(5, 6, 9, 0.75)';
        ctx.fillRect(0, 0, width, height);
      } else {
        ctx.fillStyle = '#090a0d';
        ctx.fillRect(0, 0, width, height);
      }

      // Radial background vignette / pulse
      const centerGrad = ctx.createRadialGradient(
        width / 2,
        height / 2,
        10,
        width / 2,
        height / 2,
        Math.max(width, height) / 1.5
      );
      const bassPulse = energy.bass * sensitivity * 0.25;
      centerGrad.addColorStop(0, `rgba(${activeTheme.rgb.join(',')}, ${0.08 + bassPulse})`);
      centerGrad.addColorStop(
        1,
        hasAmbientCover
          ? ambientBgRef.current === 'cover-blur'
            ? 'rgba(5, 5, 8, 0.65)'
            : 'rgba(5, 5, 8, 0.88)'
          : 'rgba(5, 5, 8, 0.98)'
      );
      ctx.fillStyle = centerGrad;
      ctx.fillRect(0, 0, width, height);

      // Render Active Mode
      switch (mode) {
        case 0:
          renderFrequencyBars(ctx, width, height, freqData, energy);
          break;
        case 1:
          renderLaserOscilloscope(ctx, width, height, timeData);
          break;
        case 2:
          renderCyberRadialHalo(ctx, width, height, freqData, energy);
          break;
        case 3:
          renderNebulaStarfield(ctx, width, height, energy);
          break;
        case 4:
          renderMatrixWaterfall(ctx, width, height, freqData);
          break;
        case 5:
          renderInfernoFlame(ctx, width, height, freqData, energy);
          break;
        case 6:
          renderVinylTurntable(ctx, width, height, energy);
          break;
        case 7:
          renderDarkEnergyCore(ctx, width, height, energy);
          break;
        case 8:
          renderMirrorLiquidWave(ctx, width, height, timeData, energy);
          break;
        case 9:
          renderRetroSynthwave(ctx, width, height, energy);
          break;
        case 10:
          renderAlbumArtPulse(ctx, width, height, freqData, energy);
          break;
        case 11:
          renderLyricsAmbientWave(ctx, width, height, timeData, energy);
          break;
        case 12:
          renderAudiophileShowcase(ctx, width, height, freqData, energy);
          break;
        default:
          renderFrequencyBars(ctx, width, height, freqData, energy);
      }

      animFrameIdRef.current = requestAnimationFrame(render);
    };

    /* ---------------- MODE 0: FREQUENCY BARS (PEAK RTA) ---------------- */
    const renderFrequencyBars = (
      c: CanvasRenderingContext2D,
      w: number,
      h: number,
      data: Uint8Array | null,
      _eng: { bass: number }
    ) => {
      const barCount = 48;
      const margin = 3;
      const totalWidth = w * 0.92;
      const barWidth = Math.max(3, (totalWidth - (barCount - 1) * margin) / barCount);
      const startX = (w - (barCount * (barWidth + margin) - margin)) / 2;
      const baselineY = h * 0.76;
      const maxHeight = h * 0.52;

      if (peaksRef.current.length !== barCount) {
        peaksRef.current = new Array(barCount).fill(0);
        peakDecayRef.current = new Array(barCount).fill(0);
      }

      for (let i = 0; i < barCount; i++) {
        const binIndex = Math.min(
          Math.floor(Math.pow(i / barCount, 1.45) * 180),
          data ? data.length - 1 : 0
        );
        const rawVal = data ? data[binIndex] : 0;
        const normalized = Math.min(1, (rawVal / 255) * sensitivity);
        const barHeight = Math.max(4, normalized * maxHeight);

        if (barHeight >= peaksRef.current[i]) {
          peaksRef.current[i] = barHeight;
          peakDecayRef.current[i] = 0;
        } else {
          peakDecayRef.current[i] += 0.25;
          peaksRef.current[i] = Math.max(0, peaksRef.current[i] - peakDecayRef.current[i]);
        }

        const x = startX + i * (barWidth + margin);
        const y = baselineY - barHeight;

        const grad = c.createLinearGradient(0, baselineY, 0, y);
        grad.addColorStop(0, activeTheme.secondary);
        grad.addColorStop(0.7, activeTheme.primary);
        grad.addColorStop(1, activeTheme.accent);

        c.fillStyle = grad;
        c.beginPath();
        c.roundRect(x, y, barWidth, barHeight, [2, 2, 0, 0]);
        c.fill();

        c.fillStyle = `rgba(${activeTheme.rgb.join(',')}, ${0.12 * normalized})`;
        c.beginPath();
        c.roundRect(x, baselineY + 3, barWidth, barHeight * 0.35, [0, 0, 2, 2]);
        c.fill();

        const peakY = baselineY - peaksRef.current[i] - 2;
        c.fillStyle = activeTheme.accent;
        c.fillRect(x, peakY, barWidth, 2);
      }

      c.strokeStyle = `rgba(${activeTheme.rgb.join(',')}, 0.3)`;
      c.lineWidth = 1;
      c.beginPath();
      c.moveTo(w * 0.04, baselineY);
      c.lineTo(w * 0.96, baselineY);
      c.stroke();
    };

    /* ---------------- MODE 1: LASER OSCILLOSCOPE ---------------- */
    const renderLaserOscilloscope = (
      c: CanvasRenderingContext2D,
      w: number,
      h: number,
      data: Uint8Array | null
    ) => {
      const centerY = h * 0.52;
      const sliceWidth = w / (data ? data.length : 256);

      c.lineWidth = 4;
      c.strokeStyle = activeTheme.glow;
      c.beginPath();
      let x = 0;
      for (let i = 0; i < (data ? data.length : 256); i++) {
        const v = data ? (data[i] - 128) / 128 : Math.sin(i * 0.1) * 0.05;
        const y = centerY + v * (h * 0.32) * sensitivity;
        if (i === 0) c.moveTo(x, y);
        else c.lineTo(x, y);
        x += sliceWidth;
      }
      c.stroke();

      c.lineWidth = 2;
      c.strokeStyle = activeTheme.accent;
      c.beginPath();
      x = 0;
      for (let i = 0; i < (data ? data.length : 256); i++) {
        const v = data ? (data[i] - 128) / 128 : Math.sin(i * 0.1) * 0.05;
        const y = centerY + v * (h * 0.32) * sensitivity;
        if (i === 0) c.moveTo(x, y);
        else c.lineTo(x, y);
        x += sliceWidth;
      }
      c.stroke();

      c.strokeStyle = 'rgba(255, 255, 255, 0.06)';
      c.lineWidth = 1;
      c.setLineDash([4, 6]);
      c.beginPath();
      c.moveTo(0, centerY);
      c.lineTo(w, centerY);
      c.moveTo(w / 2, 0);
      c.lineTo(w / 2, h);
      c.stroke();
      c.setLineDash([]);
    };

    /* ---------------- MODE 2: CYBER RADIAL HALO ---------------- */
    const renderCyberRadialHalo = (
      c: CanvasRenderingContext2D,
      w: number,
      h: number,
      data: Uint8Array | null,
      eng: { bass: number; overall: number }
    ) => {
      const cx = w / 2;
      const cy = h * 0.52;
      const baseRadius = Math.min(w, h) * 0.22 + eng.bass * sensitivity * 24;
      const points = 72;
      rotationRef.current += 0.005;

      const coreGrad = c.createRadialGradient(cx, cy, 2, cx, cy, baseRadius);
      coreGrad.addColorStop(0, activeTheme.accent);
      coreGrad.addColorStop(0.5, activeTheme.primary);
      coreGrad.addColorStop(1, 'transparent');
      c.fillStyle = coreGrad;
      c.beginPath();
      c.arc(cx, cy, baseRadius * 0.85, 0, Math.PI * 2);
      c.fill();

      for (let i = 0; i < points; i++) {
        const angle = (i / points) * Math.PI * 2 + rotationRef.current;
        const bin = Math.min(Math.floor((i / points) * 140), data ? data.length - 1 : 0);
        const val = data ? (data[bin] / 255) * sensitivity : 0.05;
        const spikeLength = Math.max(6, val * (Math.min(w, h) * 0.24));

        const x1 = cx + Math.cos(angle) * baseRadius;
        const y1 = cy + Math.sin(angle) * baseRadius;
        const x2 = cx + Math.cos(angle) * (baseRadius + spikeLength);
        const y2 = cy + Math.sin(angle) * (baseRadius + spikeLength);

        c.strokeStyle = val > 0.6 ? activeTheme.accent : activeTheme.primary;
        c.lineWidth = Math.max(2, (w / points) * 0.35);
        c.beginPath();
        c.moveTo(x1, y1);
        c.lineTo(x2, y2);
        c.stroke();
      }

      c.strokeStyle = activeTheme.glow;
      c.lineWidth = 1.5;
      c.beginPath();
      c.arc(cx, cy, baseRadius * 1.05, 0, Math.PI * 2);
      c.stroke();
    };

    /* ---------------- MODE 3: NEBULA STARFIELD ---------------- */
    const renderNebulaStarfield = (
      c: CanvasRenderingContext2D,
      w: number,
      h: number,
      eng: { bass: number; overall: number }
    ) => {
      const cx = w / 2;
      const cy = h * 0.52;
      const speed = 2 + eng.bass * sensitivity * 16;

      particlesRef.current.forEach((p) => {
        p.z = (p.z || 800) - speed;
        if (p.z <= 0) {
          p.z = 800;
          p.x = (Math.random() - 0.5) * w;
          p.y = (Math.random() - 0.5) * h;
        }

        const k = 250 / p.z;
        const sx = p.x * k + cx;
        const sy = p.y * k + cy;

        if (sx >= 0 && sx < w && sy >= 0 && sy < h) {
          const size = Math.max(1, (1 - p.z / 800) * 4.5 * (1 + eng.bass * 0.5));
          const alpha = Math.min(1, (1 - p.z / 800) * 1.2);

          c.fillStyle = `rgba(${activeTheme.rgb.join(',')}, ${alpha})`;
          c.beginPath();
          c.arc(sx, sy, size, 0, Math.PI * 2);
          c.fill();

          const prevK = 250 / (p.z + speed * 1.5);
          const px = p.x * prevK + cx;
          const py = p.y * prevK + cy;

          c.strokeStyle = `rgba(${activeTheme.rgb.join(',')}, ${alpha * 0.4})`;
          c.lineWidth = size * 0.6;
          c.beginPath();
          c.moveTo(px, py);
          c.lineTo(sx, sy);
          c.stroke();
        }
      });
    };

    /* ---------------- MODE 4: MATRIX WATERFALL ---------------- */
    const renderMatrixWaterfall = (
      c: CanvasRenderingContext2D,
      w: number,
      h: number,
      data: Uint8Array | null
    ) => {
      const colWidth = 18;
      const cols = Math.floor(w / colWidth);

      if (matrixColsRef.current.length !== cols) {
        matrixColsRef.current = [];
        const chars = '0123456789ABCDEFØ†‡§¶#@$%&*'.split('');
        for (let i = 0; i < cols; i++) {
          matrixColsRef.current.push({
            y: Math.random() * h,
            speed: Math.random() * 2 + 1,
            chars: Array.from({ length: 24 }, () => chars[Math.floor(Math.random() * chars.length)]),
          });
        }
      }

      c.font = '12px monospace';
      matrixColsRef.current.forEach((col, i) => {
        const bin = Math.min(Math.floor((i / cols) * 120), data ? data.length - 1 : 0);
        const energyVal = data ? (data[bin] / 255) * sensitivity : 0.1;

        col.y += col.speed * (1 + energyVal * 3);
        if (col.y > h + 240) col.y = -20;

        const x = i * colWidth;
        col.chars.forEach((char, ci) => {
          const cy = col.y - ci * 14;
          if (cy >= 0 && cy <= h) {
            const alpha = Math.max(0.1, 1 - ci / col.chars.length);
            c.fillStyle =
              ci === 0
                ? activeTheme.accent
                : `rgba(${activeTheme.rgb.join(',')}, ${alpha * (0.3 + energyVal * 0.7)})`;
            c.fillText(char, x, cy);
          }
        });
      });
    };

    /* ---------------- MODE 5: INFERNO PLASMA FLAME ---------------- */
    const renderInfernoFlame = (
      c: CanvasRenderingContext2D,
      w: number,
      h: number,
      data: Uint8Array | null,
      eng: { bass: number }
    ) => {
      const colCount = 36;
      const colWidth = w / colCount;
      const baseY = h * 0.88;

      for (let i = 0; i < colCount; i++) {
        const bin = Math.min(Math.floor((i / colCount) * 140), data ? data.length - 1 : 0);
        const val = data ? (data[bin] / 255) * sensitivity : 0.05;
        const flameHeight = Math.max(10, val * (h * 0.65) * (1 + (Math.random() - 0.5) * 0.2));

        const x = i * colWidth;
        const grad = c.createLinearGradient(0, baseY, 0, baseY - flameHeight);
        grad.addColorStop(0, '#ffffff');
        grad.addColorStop(0.2, activeTheme.accent);
        grad.addColorStop(0.6, activeTheme.primary);
        grad.addColorStop(1, 'transparent');

        c.fillStyle = grad;
        c.beginPath();
        c.moveTo(x, baseY);
        c.lineTo(x + colWidth / 2, baseY - flameHeight);
        c.lineTo(x + colWidth, baseY);
        c.closePath();
        c.fill();
      }

      c.fillStyle = `rgba(${activeTheme.rgb.join(',')}, ${0.4 + eng.bass * 0.4})`;
      c.fillRect(0, baseY - 2, w, 4);
    };

    /* ---------------- MODE 6: VINYL TURNTABLE (WITH ALBUM ARTWORK) ---------------- */
    const renderVinylTurntable = (
      c: CanvasRenderingContext2D,
      w: number,
      h: number,
      eng: { bass: number; overall: number }
    ) => {
      const cx = w / 2;
      const cy = h * 0.52;
      const radius = Math.min(w, h) * 0.34;
      rotationRef.current += isPlaying ? 0.02 : 0.002;

      c.save();
      c.translate(cx, cy);
      c.rotate(rotationRef.current);

      // Outer Vinyl Body
      c.fillStyle = '#0f1115';
      c.beginPath();
      c.arc(0, 0, radius, 0, Math.PI * 2);
      c.fill();
      c.lineWidth = 2;
      c.strokeStyle = '#27272a';
      c.stroke();

      // Microgrooves
      const grooveCount = 18;
      for (let i = 0; i < grooveCount; i++) {
        const r = radius * 0.45 + (i / grooveCount) * (radius * 0.52);
        c.strokeStyle = i % 2 === 0 ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.4)';
        c.lineWidth = 1;
        c.beginPath();
        c.arc(0, 0, r, 0, Math.PI * 2);
        c.stroke();
      }

      // Audio-reactive light glare sheen (45-degree reflection)
      const sheenGrad = c.createLinearGradient(-radius, -radius, radius, radius);
      const sheenAlpha = 0.08 + eng.bass * sensitivity * 0.15;
      sheenGrad.addColorStop(0, `rgba(${activeTheme.rgb.join(',')}, ${sheenAlpha})`);
      sheenGrad.addColorStop(0.5, 'transparent');
      sheenGrad.addColorStop(1, `rgba(${activeTheme.rgb.join(',')}, ${sheenAlpha})`);
      c.fillStyle = sheenGrad;
      c.beginPath();
      c.arc(0, 0, radius, 0, Math.PI * 2);
      c.fill();

      // Center Record Label: Draw Album Artwork if available!
      const labelRadius = radius * 0.36;
      if (albumArtImgRef.current && albumArtImgRef.current.complete) {
        c.save();
        c.beginPath();
        c.arc(0, 0, labelRadius, 0, Math.PI * 2);
        c.clip();
        c.drawImage(albumArtImgRef.current, -labelRadius, -labelRadius, labelRadius * 2, labelRadius * 2);
        c.restore();

        // Rim around artwork label
        c.strokeStyle = activeTheme.primary;
        c.lineWidth = 2;
        c.beginPath();
        c.arc(0, 0, labelRadius, 0, Math.PI * 2);
        c.stroke();
      } else {
        // Fallback stylized label
        c.fillStyle = activeTheme.secondary;
        c.beginPath();
        c.arc(0, 0, labelRadius, 0, Math.PI * 2);
        c.fill();

        c.fillStyle = activeTheme.primary;
        c.beginPath();
        c.arc(0, 0, labelRadius * 0.75, 0, Math.PI * 2);
        c.fill();
      }

      // Center Spindle Hole
      c.fillStyle = '#000000';
      c.beginPath();
      c.arc(0, 0, radius * 0.06, 0, Math.PI * 2);
      c.fill();

      c.restore();
    };

    /* ---------------- MODE 7: DARK ENERGY CORE ---------------- */
    const renderDarkEnergyCore = (
      c: CanvasRenderingContext2D,
      w: number,
      h: number,
      eng: { bass: number; overall: number }
    ) => {
      const cx = w / 2;
      const cy = h * 0.52;
      const coreRadius = Math.min(w, h) * 0.14 + eng.bass * sensitivity * 35;

      if (eng.bass > 0.55 && Math.random() < 0.4) {
        shockwaveRingsRef.current.push({
          radius: coreRadius,
          maxRadius: Math.min(w, h) * 0.65,
          alpha: 0.9,
        });
      }

      for (let i = shockwaveRingsRef.current.length - 1; i >= 0; i--) {
        const ring = shockwaveRingsRef.current[i];
        ring.radius += 5 + eng.bass * 8;
        ring.alpha -= 0.02;

        c.strokeStyle = `rgba(${activeTheme.rgb.join(',')}, ${ring.alpha})`;
        c.lineWidth = 3;
        c.beginPath();
        c.arc(cx, cy, ring.radius, 0, Math.PI * 2);
        c.stroke();

        if (ring.alpha <= 0 || ring.radius >= ring.maxRadius) {
          shockwaveRingsRef.current.splice(i, 1);
        }
      }

      c.fillStyle = '#000000';
      c.beginPath();
      c.arc(cx, cy, coreRadius, 0, Math.PI * 2);
      c.fill();

      const corona = c.createRadialGradient(cx, cy, coreRadius * 0.8, cx, cy, coreRadius * 1.6);
      corona.addColorStop(0, activeTheme.accent);
      corona.addColorStop(0.5, activeTheme.primary);
      corona.addColorStop(1, 'transparent');
      c.fillStyle = corona;
      c.beginPath();
      c.arc(cx, cy, coreRadius * 1.6, 0, Math.PI * 2);
      c.fill();
    };

    /* ---------------- MODE 8: MIRROR LIQUID WAVE ---------------- */
    const renderMirrorLiquidWave = (
      c: CanvasRenderingContext2D,
      w: number,
      h: number,
      data: Uint8Array | null,
      _eng: { bass: number }
    ) => {
      const centerY = h * 0.52;
      const step = 4;
      const count = Math.floor(w / step);

      c.beginPath();
      c.moveTo(0, centerY);

      for (let i = 0; i < count; i++) {
        const bin = Math.min(Math.floor((i / count) * 128), data ? data.length - 1 : 0);
        const v = data ? (data[bin] - 128) / 128 : 0;
        const x = i * step;
        const y = centerY - Math.abs(v) * (h * 0.3) * sensitivity - 4;
        c.lineTo(x, y);
      }

      for (let i = count - 1; i >= 0; i--) {
        const bin = Math.min(Math.floor((i / count) * 128), data ? data.length - 1 : 0);
        const v = data ? (data[bin] - 128) / 128 : 0;
        const x = i * step;
        const y = centerY + Math.abs(v) * (h * 0.3) * sensitivity + 4;
        c.lineTo(x, y);
      }
      c.closePath();

      const waveGrad = c.createLinearGradient(0, centerY - h * 0.3, 0, centerY + h * 0.3);
      waveGrad.addColorStop(0, activeTheme.accent);
      waveGrad.addColorStop(0.5, `rgba(${activeTheme.rgb.join(',')}, 0.2)`);
      waveGrad.addColorStop(1, activeTheme.secondary);
      c.fillStyle = waveGrad;
      c.fill();

      c.strokeStyle = activeTheme.accent;
      c.lineWidth = 1.5;
      c.stroke();
    };

    /* ---------------- MODE 9: RETRO SYNTHWAVE HORIZON ---------------- */
    const renderRetroSynthwave = (
      c: CanvasRenderingContext2D,
      w: number,
      h: number,
      eng: { bass: number }
    ) => {
      const horizonY = h * 0.52;
      const cx = w / 2;
      gridOffsetRef.current = (gridOffsetRef.current + (1.5 + eng.bass * sensitivity * 8)) % 30;

      const sunRadius = Math.min(w, h) * 0.18;
      const sunGrad = c.createLinearGradient(0, horizonY - sunRadius * 2, 0, horizonY);
      sunGrad.addColorStop(0, '#fef08a');
      sunGrad.addColorStop(0.5, activeTheme.accent);
      sunGrad.addColorStop(1, activeTheme.primary);

      c.fillStyle = sunGrad;
      c.beginPath();
      c.arc(cx, horizonY, sunRadius, Math.PI, 0, false);
      c.fill();

      c.fillStyle = '#090a0d';
      for (let y = horizonY - sunRadius + 15; y < horizonY; y += 12) {
        c.fillRect(cx - sunRadius, y, sunRadius * 2, 3);
      }

      c.strokeStyle = activeTheme.accent;
      c.lineWidth = 2;
      c.beginPath();
      c.moveTo(0, horizonY);
      c.lineTo(w, horizonY);
      c.stroke();

      c.strokeStyle = `rgba(${activeTheme.rgb.join(',')}, 0.45)`;
      c.lineWidth = 1;

      const lineCount = 20;
      for (let i = 0; i <= lineCount; i++) {
        const bottomX = (w / lineCount) * i;
        c.beginPath();
        c.moveTo(cx, horizonY);
        c.lineTo(bottomX, h);
        c.stroke();
      }

      for (let y = horizonY + 6; y < h; y += 6 + Math.pow((y - horizonY) / 14, 1.4)) {
        const adjustedY = y + gridOffsetRef.current * ((y - horizonY) / h);
        if (adjustedY <= h) {
          c.beginPath();
          c.moveTo(0, adjustedY);
          c.lineTo(w, adjustedY);
          c.stroke();
        }
      }
    };

    /* ---------------- MODE 10: ALBUM ART PULSE (COVER ART VISUALIZER) ---------------- */
    const renderAlbumArtPulse = (
      c: CanvasRenderingContext2D,
      w: number,
      h: number,
      data: Uint8Array | null,
      eng: { bass: number; overall: number }
    ) => {
      const cx = w / 2;
      const cy = h * 0.44;
      const bassBump = eng.bass * sensitivity * 22;
      const boxSize = Math.min(w, h) * 0.36 + bassBump;
      const radius = (boxSize / 2) * 1.34;

      // 1. Bass shockwaves
      if (eng.bass > 0.58 && Math.random() < 0.3) {
        shockwaveRingsRef.current.push({
          radius: boxSize * 0.6,
          maxRadius: Math.min(w, h) * 0.78,
          alpha: 0.85,
        });
      }

      for (let i = shockwaveRingsRef.current.length - 1; i >= 0; i--) {
        const ring = shockwaveRingsRef.current[i];
        ring.radius += 4 + eng.bass * 6;
        ring.alpha -= 0.025;

        c.strokeStyle = `rgba(${activeTheme.rgb.join(',')}, ${ring.alpha})`;
        c.lineWidth = 2.5;
        c.beginPath();
        c.arc(cx, cy, ring.radius, 0, Math.PI * 2);
        c.stroke();

        if (ring.alpha <= 0 || ring.radius >= ring.maxRadius) {
          shockwaveRingsRef.current.splice(i, 1);
        }
      }

      // 2. Circular 360° frequency halo around cover art
      const spikeCount = 64;
      rotationRef.current += 0.003;
      for (let i = 0; i < spikeCount; i++) {
        const angle = (i / spikeCount) * Math.PI * 2 + rotationRef.current;
        const bin = Math.min(Math.floor((i / spikeCount) * 120), data ? data.length - 1 : 0);
        const val = data ? (data[bin] / 255) * sensitivity : 0.05;
        const spikeLength = Math.max(8, val * (Math.min(w, h) * 0.16));

        const x1 = cx + Math.cos(angle) * radius;
        const y1 = cy + Math.sin(angle) * radius;
        const x2 = cx + Math.cos(angle) * (radius + spikeLength);
        const y2 = cy + Math.sin(angle) * (radius + spikeLength);

        c.strokeStyle = val > 0.6 ? activeTheme.accent : activeTheme.primary;
        c.lineWidth = Math.max(2, (w / spikeCount) * 0.3);
        c.beginPath();
        c.moveTo(x1, y1);
        c.lineTo(x2, y2);
        c.stroke();
      }

      // Outer glow circle
      c.strokeStyle = activeTheme.glow;
      c.lineWidth = 1.5;
      c.beginPath();
      c.arc(cx, cy, radius, 0, Math.PI * 2);
      c.stroke();

      // 3. Draw Album Artwork or Fallback Box
      const half = boxSize / 2;
      const cornerRadius = 16;

      // Glow backing
      c.save();
      c.shadowColor = activeTheme.primary;
      c.shadowBlur = 25 + bassBump * 1.5;
      c.strokeStyle = activeTheme.accent;
      c.lineWidth = 2.5;
      c.beginPath();
      c.roundRect(cx - half, cy - half, boxSize, boxSize, cornerRadius);
      c.stroke();
      c.restore();

      if (albumArtImgRef.current && albumArtImgRef.current.complete) {
        c.save();
        c.beginPath();
        c.roundRect(cx - half, cy - half, boxSize, boxSize, cornerRadius);
        c.clip();
        c.drawImage(albumArtImgRef.current, cx - half, cy - half, boxSize, boxSize);
        c.restore();

        // 4. Floor reflection
        const reflHeight = boxSize * 0.38;
        c.save();
        c.beginPath();
        c.roundRect(cx - half, cy + half + 8, boxSize, reflHeight, [0, 0, cornerRadius, cornerRadius]);
        c.clip();

        c.translate(cx, cy + half + 8 + reflHeight);
        c.scale(1, -1);
        c.drawImage(albumArtImgRef.current, -half, 0, boxSize, boxSize);

        c.scale(1, -1);
        c.translate(-cx, -(cy + half + 8 + reflHeight));
        const reflGrad = c.createLinearGradient(0, cy + half + 8, 0, cy + half + 8 + reflHeight);
        reflGrad.addColorStop(0, 'rgba(9, 10, 13, 0.45)');
        reflGrad.addColorStop(1, 'rgba(9, 10, 13, 0.98)');
        c.fillStyle = reflGrad;
        c.fillRect(cx - half - 2, cy + half + 6, boxSize + 4, reflHeight + 4);
        c.restore();
      } else {
        // Fallback stylized box
        c.fillStyle = '#14171f';
        c.beginPath();
        c.roundRect(cx - half, cy - half, boxSize, boxSize, cornerRadius);
        c.fill();

        c.fillStyle = activeTheme.accent;
        c.font = 'bold 15px sans-serif';
        c.textAlign = 'center';
        c.fillText(currentTrackRef.current?.title || 'Resonix', cx, cy - 8);
        c.fillStyle = '#71717a';
        c.font = '12px sans-serif';
        c.fillText(currentTrackRef.current?.artistName || 'Playing Music', cx, cy + 16);
      }
    };

    /* ---------------- MODE 11: LIVE SYNCED LYRICS AMBIENT CANVAS ---------------- */
    const renderLyricsAmbientWave = (
      c: CanvasRenderingContext2D,
      w: number,
      h: number,
      timeData: Uint8Array | null,
      eng: { bass: number }
    ) => {
      // Gentle particle drift in background
      particlesRef.current.forEach((p) => {
        p.x += p.vx * 0.6;
        p.y += p.vy * 0.6;
        if (p.x < 0) p.x = w;
        if (p.x > w) p.x = 0;
        if (p.y < 0) p.y = h;
        if (p.y > h) p.y = 0;

        c.fillStyle = `rgba(${activeTheme.rgb.join(',')}, ${p.alpha * 0.25})`;
        c.beginPath();
        c.arc(p.x, p.y, p.size * (1 + eng.bass * 0.4), 0, Math.PI * 2);
        c.fill();
      });

      // Harmonic waveform flowing at bottom of the canvas
      const baseY = h * 0.88;
      const count = 64;
      const step = w / count;

      c.beginPath();
      c.moveTo(0, baseY);
      for (let i = 0; i <= count; i++) {
        const bin = Math.min(Math.floor((i / count) * 128), timeData ? timeData.length - 1 : 0);
        const v = timeData ? (timeData[bin] - 128) / 128 : Math.sin(i * 0.2) * 0.1;
        const x = i * step;
        const y = baseY + v * 35 * sensitivity;
        c.lineTo(x, y);
      }
      c.lineTo(w, h);
      c.lineTo(0, h);
      c.closePath();

      const grad = c.createLinearGradient(0, baseY - 40, 0, h);
      grad.addColorStop(0, `rgba(${activeTheme.rgb.join(',')}, 0.25)`);
      grad.addColorStop(1, 'transparent');
      c.fillStyle = grad;
      c.fill();
    };

    /* ---------------- MODE 12: AUDIOPHILE STAGE & DUAL VU METERS ---------------- */
    const renderAudiophileShowcase = (
      c: CanvasRenderingContext2D,
      w: number,
      h: number,
      freqData: Uint8Array | null,
      eng: { bass: number; mid: number; treble: number; overall: number }
    ) => {
      const cx = w / 2;
      const cy = h * 0.40;
      const boxSize = Math.min(w * 0.32, h * 0.40, 320);
      const half = boxSize / 2;
      const cornerRadius = 14;

      // 1. Dynamic background frequency halo behind cover art
      const haloRays = 48;
      rotationRef.current += 0.004;
      for (let i = 0; i < haloRays; i++) {
        const angle = (i / haloRays) * Math.PI * 2 + rotationRef.current * 0.4;
        const bin = Math.min(Math.floor((i / haloRays) * 100), freqData ? freqData.length - 1 : 0);
        const val = freqData ? (freqData[bin] / 255) * sensitivity : 0.05;
        const rayLen = val * (boxSize * 0.35);

        const x1 = cx + Math.cos(angle) * (half * 1.05);
        const y1 = cy + Math.sin(angle) * (half * 1.05);
        const x2 = cx + Math.cos(angle) * (half * 1.05 + rayLen);
        const y2 = cy + Math.sin(angle) * (half * 1.05 + rayLen);

        c.strokeStyle = val > 0.6 ? activeTheme.accent : `rgba(${activeTheme.rgb.join(',')}, 0.5)`;
        c.lineWidth = 2.5;
        c.beginPath();
        c.moveTo(x1, y1);
        c.lineTo(x2, y2);
        c.stroke();
      }

      // 2. Large Central Album Cover
      c.save();
      c.shadowColor = activeTheme.primary;
      c.shadowBlur = 30 + eng.bass * 25;
      c.strokeStyle = `rgba(${activeTheme.rgb.join(',')}, 0.8)`;
      c.lineWidth = 2;
      c.beginPath();
      c.roundRect(cx - half, cy - half, boxSize, boxSize, cornerRadius);
      c.stroke();
      c.restore();

      if (albumArtImgRef.current && albumArtImgRef.current.complete) {
        c.save();
        c.beginPath();
        c.roundRect(cx - half, cy - half, boxSize, boxSize, cornerRadius);
        c.clip();
        c.drawImage(albumArtImgRef.current, cx - half, cy - half, boxSize, boxSize);
        c.restore();

        // 3. Mirror glass reflection below artwork
        const reflHeight = boxSize * 0.30;
        c.save();
        c.beginPath();
        c.roundRect(cx - half, cy + half + 6, boxSize, reflHeight, [0, 0, cornerRadius, cornerRadius]);
        c.clip();
        c.translate(cx, cy + half + 6 + reflHeight);
        c.scale(1, -1);
        c.drawImage(albumArtImgRef.current, -half, 0, boxSize, boxSize);
        c.scale(1, -1);
        c.translate(-cx, -(cy + half + 6 + reflHeight));

        const reflGrad = c.createLinearGradient(0, cy + half + 6, 0, cy + half + 6 + reflHeight);
        reflGrad.addColorStop(0, 'rgba(8, 9, 12, 0.45)');
        reflGrad.addColorStop(1, 'rgba(8, 9, 12, 0.98)');
        c.fillStyle = reflGrad;
        c.fillRect(cx - half - 2, cy + half + 4, boxSize + 4, reflHeight + 4);
        c.restore();
      } else {
        c.fillStyle = '#11131a';
        c.beginPath();
        c.roundRect(cx - half, cy - half, boxSize, boxSize, cornerRadius);
        c.fill();

        c.fillStyle = activeTheme.accent;
        c.font = 'bold 16px sans-serif';
        c.textAlign = 'center';
        c.fillText(currentTrackRef.current?.title || 'Resonix', cx, cy - 8);
        c.fillStyle = '#9ca3af';
        c.font = '12px sans-serif';
        c.fillText(currentTrackRef.current?.artistName || 'Hi-Fi Audio', cx, cy + 16);
      }

      // 4. Vintage Analog VU Meters (Twin Dial Units)
      const targetL = Math.min(1, (eng.bass * 1.3 + eng.mid * 0.5) * sensitivity);
      const targetR = Math.min(1, (eng.treble * 1.2 + eng.overall * 0.7) * sensitivity);
      vuMeterRef.current.left += (targetL - vuMeterRef.current.left) * 0.22;
      vuMeterRef.current.right += (targetR - vuMeterRef.current.right) * 0.22;

      const vuWidth = Math.min(w * 0.22, 175);
      const vuHeight = vuWidth * 0.65;
      const vuY = cy - vuHeight / 2;

      const drawVuMeter = (meterX: number, meterY: number, label: string, value: number) => {
        c.save();
        // Bezel frame
        c.fillStyle = '#0d0f14';
        c.strokeStyle = '#27272a';
        c.lineWidth = 1.5;
        c.beginPath();
        c.roundRect(meterX, meterY, vuWidth, vuHeight, 8);
        c.fill();
        c.stroke();

        // Inner warm amber dial face
        const innerPad = 5;
        const faceX = meterX + innerPad;
        const faceY = meterY + innerPad;
        const faceW = vuWidth - innerPad * 2;
        const faceH = vuHeight - innerPad * 2;

        const dialGrad = c.createLinearGradient(faceX, faceY, faceX, faceY + faceH);
        dialGrad.addColorStop(0, '#fef3c7');
        dialGrad.addColorStop(0.8, '#fde68a');
        dialGrad.addColorStop(1, '#f59e0b');
        c.fillStyle = dialGrad;
        c.beginPath();
        c.roundRect(faceX, faceY, faceW, faceH, 5);
        c.fill();

        // Arc scale
        const pivotX = faceX + faceW / 2;
        const pivotY = faceY + faceH * 1.15;
        const arcRadius = faceH * 0.95;

        // Normal zone (Black) & Overload zone (Red)
        c.lineWidth = 2;
        c.strokeStyle = '#18181b';
        c.beginPath();
        c.arc(pivotX, pivotY, arcRadius, -Math.PI * 0.75, -Math.PI * 0.35, false);
        c.stroke();

        c.strokeStyle = '#dc2626';
        c.beginPath();
        c.arc(pivotX, pivotY, arcRadius, -Math.PI * 0.35, -Math.PI * 0.25, false);
        c.stroke();

        // dB Tick marks
        c.fillStyle = '#18181b';
        c.font = 'bold 7px sans-serif';
        c.textAlign = 'center';
        const ticks = [
          { val: 0.0, label: '-20' },
          { val: 0.3, label: '-10' },
          { val: 0.5, label: '-5' },
          { val: 0.75, label: '0' },
          { val: 1.0, label: '+3' },
        ];
        ticks.forEach((t) => {
          const tAngle = -Math.PI * 0.75 + t.val * (Math.PI * 0.5);
          const tx1 = pivotX + Math.cos(tAngle) * arcRadius;
          const ty1 = pivotY + Math.sin(tAngle) * arcRadius;
          const tx2 = pivotX + Math.cos(tAngle) * (arcRadius - 4);
          const ty2 = pivotY + Math.sin(tAngle) * (arcRadius - 4);
          c.strokeStyle = t.val > 0.75 ? '#dc2626' : '#18181b';
          c.beginPath();
          c.moveTo(tx1, ty1);
          c.lineTo(tx2, ty2);
          c.stroke();
          c.fillText(t.label, tx2, ty2 - 2);
        });

        // Label: "LEFT CH" or "RIGHT CH"
        c.fillStyle = '#451a03';
        c.font = 'bold 8px sans-serif';
        c.fillText(`VU • ${label}`, pivotX, faceY + faceH * 0.75);

        // Analog Needle with ballistic angle
        const needleAngle = -Math.PI * 0.75 + Math.max(0, Math.min(1, value)) * (Math.PI * 0.5);
        const nx = pivotX + Math.cos(needleAngle) * (arcRadius + 2);
        const ny = pivotY + Math.sin(needleAngle) * (arcRadius + 2);

        c.strokeStyle = '#991b1b';
        c.lineWidth = 1.5;
        c.beginPath();
        c.moveTo(pivotX, pivotY);
        c.lineTo(nx, ny);
        c.stroke();

        // Pivot cap
        c.fillStyle = '#18181b';
        c.beginPath();
        c.arc(pivotX, pivotY, 3, 0, Math.PI * 2);
        c.fill();

        c.restore();
      };

      // Draw Left & Right VU Meters flanking the cover art on wider screens
      if (w > 640) {
        drawVuMeter(cx - half - vuWidth - 24, vuY, 'CH 1 (L)', vuMeterRef.current.left);
        drawVuMeter(cx + half + 24, vuY, 'CH 2 (R)', vuMeterRef.current.right);
      } else {
        const mY = cy + half + 18;
        drawVuMeter(cx - vuWidth - 6, mY, 'CH 1 (L)', vuMeterRef.current.left);
        drawVuMeter(cx + 6, mY, 'CH 2 (R)', vuMeterRef.current.right);
      }

      // 5. Audiophile Metadata Typography Banner below
      const infoY = Math.min(h * 0.76, cy + half + (w > 640 ? 50 : vuHeight + 35));
      c.save();
      c.textAlign = 'center';

      // Title
      c.fillStyle = '#ffffff';
      c.font = 'bold 18px sans-serif';
      const titleText = currentTrackRef.current?.title || 'Unknown Title';
      c.fillText(titleText, cx, infoY);

      // Artist & Album
      c.fillStyle = activeTheme.accent;
      c.font = '13px sans-serif';
      const subText = `${currentTrackRef.current?.artistName || 'Unknown Artist'} — ${currentTrackRef.current?.albumTitle || 'Unknown Album'}`;
      c.fillText(subText, cx, infoY + 22);

      // Hi-Fi Audio Spec Pill: Codec, sample rate, bit depth
      const track = currentTrackRef.current;
      const isLossless = track?.isLossless;
      const codecStr = (track?.codec || (isLossless ? 'FLAC' : 'MP3')).toUpperCase();
      const srStr = track?.sampleRate ? `${(track.sampleRate / 1000).toFixed(1)} kHz` : '44.1 kHz';
      const bdStr = track?.bitDepth ? `${track.bitDepth}-bit` : isLossless ? '16-bit' : '320 kbps';
      const specPill = `${isLossless ? '✦ LOSSLESS • ' : ''}${codecStr} • ${bdStr} • ${srStr}`;

      c.fillStyle = isLossless ? '#fef08a' : '#a1a1aa';
      c.font = 'bold 10px monospace';
      c.fillText(specPill, cx, infoY + 42);
      c.restore();
    };

    render();

    return () => {
      if (animFrameIdRef.current) cancelAnimationFrame(animFrameIdRef.current);
      window.removeEventListener('resize', resizeCanvas);
    };
  }, [isOpen, mode, theme, sensitivity, isPlaying, activeTheme]);

  if (!isOpen) return null;

  const formatTime = (sec: number) => {
    if (!sec || isNaN(sec) || !isFinite(sec)) return '0:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <div
      ref={containerRef}
      onMouseMove={handleMouseMove}
      className={`fixed inset-0 z-50 bg-black flex flex-col select-none overflow-hidden ${
        isFullscreen ? 'w-screen h-screen' : ''
      }`}
    >
      {/* Ambient Cover Art Background */}
      {visualizerAmbientBg !== 'off' && currentTrack?.artworkId && (
        <div className="absolute inset-0 pointer-events-none overflow-hidden z-0 select-none">
          <img
            src={api.getArtworkUrl(currentTrack.artworkId, 512)}
            alt=""
            className={`w-full h-full object-cover transition-all duration-1000 scale-125 select-none ${
              visualizerAmbientBg === 'cover-blur'
                ? 'opacity-40 blur-3xl saturate-150'
                : 'opacity-20 blur-3xl saturate-125'
            }`}
          />
          <div className="absolute inset-0 bg-radial from-transparent via-black/40 to-black/85" />
        </div>
      )}

      {/* Visualizer Canvas (Placed at z-0 so it NEVER blocks overlay controls) */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 z-0 w-full h-full block"
      />

      {/* Mode 11: Live Synced Lyrics Fullscreen Overlay (Placed at z-20) */}
      {mode === 11 && (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              toggleOverlay();
            }
          }}
          className="absolute inset-0 z-20 flex flex-col items-center justify-center pointer-events-auto overflow-hidden px-4 pt-20 pb-28"
        >
          {lyricsLoading ? (
            <div className="flex flex-col items-center space-y-3 text-zinc-400">
              <div className="w-8 h-8 border-2 border-crimson-500 border-t-transparent rounded-full animate-spin" />
              <span className="font-mono text-xs">Memuat lirik...</span>
            </div>
          ) : lyricsData?.isSynced && lyricsData.lines && lyricsData.lines.length > 0 ? (
            <div className="w-full max-w-3xl h-full overflow-y-auto no-scrollbar flex flex-col items-center py-32 space-y-7 text-center select-none">
              {lyricsData.lines.map((line, idx) => {
                const isActive = idx === activeLyricsIndex;
                const isNear = Math.abs(idx - activeLyricsIndex) <= 2;

                return (
                  <div
                    key={`${line.time}-${idx}`}
                    ref={isActive ? activeLyricsLineRef : null}
                    onClick={() => seek(line.time)}
                    style={{
                      color: isActive ? activeTheme.accent : undefined,
                      textShadow: isActive ? `0 0 25px ${activeTheme.glow}` : undefined,
                    }}
                    className={`transition-all duration-300 font-sans cursor-pointer px-4 py-1.5 rounded-xl ${
                      isActive
                        ? 'text-2xl sm:text-4xl font-extrabold scale-105 tracking-tight'
                        : isNear
                        ? 'text-base sm:text-xl font-medium text-zinc-300 hover:text-white opacity-60 hover:opacity-100'
                        : 'text-sm sm:text-base text-zinc-500 hover:text-zinc-300 opacity-25 hover:opacity-75'
                    }`}
                  >
                    {line.text || '♪'}
                  </div>
                );
              })}
            </div>
          ) : lyricsData?.plainText ? (
            <div className="w-full max-w-2xl max-h-[70vh] overflow-y-auto no-scrollbar text-center text-zinc-200 text-sm sm:text-base leading-relaxed px-6 whitespace-pre-line font-sans scrollbar-thin scrollbar-thumb-charcoal-700">
              {lyricsData.plainText}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center text-center space-y-4 max-w-md p-6 rounded-2xl bg-charcoal-900/60 border border-charcoal-800 backdrop-blur-md">
              <div className="w-24 h-24 rounded-xl overflow-hidden shadow-2xl border border-charcoal-700/80 bg-charcoal-950">
                {currentTrack?.artworkId ? (
                  <img
                    src={api.getArtworkUrl(currentTrack.artworkId, 256)}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-zinc-600">
                    <Music size={32} />
                  </div>
                )}
              </div>
              <div>
                <h4 className="text-sm font-bold text-white truncate max-w-xs">{currentTrack?.title || 'No Track'}</h4>
                <p className="text-xs text-zinc-400 truncate max-w-xs">{currentTrack?.artistName || ''}</p>
              </div>
              <p className="text-xs text-zinc-500 font-mono">Belum ada lirik untuk lagu ini</p>
              <button
                onClick={() => refetchLyricsMutation.mutate()}
                disabled={refetchLyricsMutation.isPending}
                className="px-3.5 py-1.5 bg-charcoal-800 hover:bg-crimson-800 text-zinc-200 hover:text-white rounded-lg border border-charcoal-700 text-xs font-medium transition cursor-pointer flex items-center space-x-1.5"
              >
                <RefreshCw size={12} className={refetchLyricsMutation.isPending ? 'animate-spin text-crimson-400' : ''} />
                <span>{refetchLyricsMutation.isPending ? 'Mencari...' : 'Cari Lirik di LRCLIB'}</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* Floating Header Controls (Placed at z-30 with e.stopPropagation() so buttons are ALWAYS clickable) */}
      <div
        onMouseEnter={() => setIsHoveringControls(true)}
        onMouseLeave={() => setIsHoveringControls(false)}
        onClick={(e) => e.stopPropagation()}
        className={`absolute top-0 left-0 right-0 z-30 p-3 sm:p-4 bg-gradient-to-b from-black/85 via-black/50 to-transparent transition-opacity duration-300 pointer-events-auto flex items-center justify-between ${
          controlsVisible && showOverlay ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        {/* Left: Mode Title & Switcher */}
        <div className="flex items-center space-x-2 sm:space-x-3">
          {/* Mode Title Button & Dropdown Trigger */}
          <div className="relative">
            <button
              onClick={() => setIsModePickerOpen(!isModePickerOpen)}
              className="flex items-center space-x-2 bg-charcoal-900/90 hover:bg-charcoal-850 border border-charcoal-700/80 rounded-lg px-2.5 py-1.5 shadow-lg backdrop-blur-md transition cursor-pointer text-left"
            >
              <Waves size={16} className="text-crimson-500 animate-pulse shrink-0" />
              <div className="flex flex-col">
                <span className="font-semibold text-zinc-100 text-xs tracking-wide flex items-center gap-1">
                  {activeModeDef.name}
                  <ChevronDown size={12} className="text-zinc-400" />
                </span>
                <span className="font-mono text-[9px] text-zinc-400 truncate max-w-[130px] sm:max-w-[180px]">
                  {activeModeDef.tagline}
                </span>
              </div>
            </button>

            {/* Mode Picker Dropdown Menu */}
            {isModePickerOpen && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setIsModePickerOpen(false)}
                />
                <div className="absolute left-0 top-full mt-2 w-72 sm:w-80 bg-charcoal-900 border border-charcoal-700 rounded-xl p-2 shadow-2xl backdrop-blur-xl z-50 text-xs max-h-[70vh] overflow-y-auto scrollbar-thin scrollbar-thumb-charcoal-700 space-y-1">
                  <div className="px-2 py-1 text-[10px] font-mono uppercase text-zinc-400 tracking-wider font-semibold border-b border-charcoal-800 flex justify-between items-center">
                    <span>Pilih Preset Visualisasi</span>
                    <span className="text-crimson-400 font-bold">{mode + 1} / {VISUALIZER_MODES.length}</span>
                  </div>

                  {VISUALIZER_MODES.map((m) => {
                    const isSelected = mode === m.id;
                    return (
                      <button
                        key={m.id}
                        onClick={() => {
                          setMode(m.id);
                          setIsModePickerOpen(false);
                        }}
                        className={`w-full text-left p-2 rounded-lg transition flex items-start space-x-2.5 cursor-pointer ${
                          isSelected
                            ? 'bg-crimson-950/70 text-white border border-crimson-700/70 shadow-xs ring-1 ring-crimson-500/30'
                            : 'text-zinc-300 hover:text-white hover:bg-charcoal-800'
                        }`}
                      >
                        <span className="font-mono text-[11px] font-bold text-crimson-400 mt-0.5 w-5 shrink-0">
                          {m.id + 1}.
                        </span>
                        <div className="flex flex-col flex-1 truncate">
                          <span className="font-medium text-xs truncate flex items-center gap-1.5">
                            {m.id === 10 || m.id === 12 ? '🖼️ ' : m.id === 6 ? '💿 ' : m.id === 11 ? '🎤 ' : '📊 '}
                            {m.name}
                          </span>
                          <span className="text-[10px] font-mono text-zinc-400 truncate">{m.tagline}</span>
                          <span className="text-[9px] text-zinc-500 line-clamp-1">{m.description}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>

          {/* Mode Prev / Next buttons */}
          <div className="flex items-center space-x-1 bg-charcoal-900/80 border border-charcoal-700/80 rounded-lg p-1 backdrop-blur-md">
            <button
              onClick={prevMode}
              title="Previous Mode (Left Arrow)"
              className="p-1 text-zinc-400 hover:text-white hover:bg-charcoal-800 rounded transition cursor-pointer"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="font-mono text-[10px] text-zinc-300 px-1.5">
              {mode + 1} / {VISUALIZER_MODES.length}
            </span>
            <button
              onClick={nextMode}
              title="Next Mode (Right Arrow)"
              className="p-1 text-zinc-400 hover:text-white hover:bg-charcoal-800 rounded transition cursor-pointer"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>

        {/* Center: Mode Quick Selector Bar */}
        <div className="hidden md:flex items-center gap-1 bg-charcoal-900/80 border border-charcoal-700/80 rounded-lg p-1 backdrop-blur-md max-w-xl overflow-x-auto no-scrollbar">
          {VISUALIZER_MODES.map((m) => {
            const shortLabel = m.id === 10 ? 'Cover Pulse' : m.id === 12 ? 'Cover VU' : m.id === 11 ? 'Lyrics' : m.name.split(' ')[0];
            return (
              <button
                key={m.id}
                onClick={() => setMode(m.id)}
                className={`px-2 py-0.5 rounded text-[10px] font-mono transition whitespace-nowrap cursor-pointer ${
                  mode === m.id
                    ? 'bg-crimson-700 text-white font-bold shadow-xs'
                    : 'text-zinc-400 hover:text-white hover:bg-charcoal-800'
                }`}
              >
                {m.id + 1}. {shortLabel}
              </button>
            );
          })}
        </div>

        {/* Right: Theme, Sensitivity & Controls */}
        <div className="flex items-center space-x-2">
          {/* Theme Dropdown / Color Circles */}
          <div className="flex items-center space-x-1 bg-charcoal-900/80 border border-charcoal-700/80 rounded-lg p-1 backdrop-blur-md">
            {(Object.keys(THEMES) as VisualizerTheme[]).map((tKey) => (
              <button
                key={tKey}
                onClick={() => setTheme(tKey)}
                title={THEMES[tKey].name}
                style={{ backgroundColor: THEMES[tKey].primary }}
                className={`w-4.5 h-4.5 rounded-full transition transform hover:scale-110 cursor-pointer ${
                  theme === tKey ? 'ring-2 ring-white scale-110 shadow-sm' : 'opacity-60'
                }`}
              />
            ))}
          </div>

          {/* Sensitivity Slider */}
          <div className="hidden sm:flex items-center space-x-1.5 bg-charcoal-900/80 border border-charcoal-700/80 rounded-lg px-2 py-1 backdrop-blur-md">
            <Sliders size={13} className="text-zinc-400" />
            <span className="font-mono text-[9px] text-zinc-400">Sens:</span>
            <input
              type="range"
              min={0.5}
              max={2.5}
              step={0.1}
              value={sensitivity}
              onChange={(e) => setSensitivity(parseFloat(e.target.value))}
              className="w-14 h-1 bg-charcoal-700 accent-crimson-600 rounded cursor-pointer"
            />
            <span className="font-mono text-[9px] text-zinc-300 w-6">
              {sensitivity.toFixed(1)}x
            </span>
          </div>

          {/* Cover Art Ambient Background Toggle */}
          <button
            onClick={() => {
              const next =
                visualizerAmbientBg === 'cover-blur'
                  ? 'dim'
                  : visualizerAmbientBg === 'dim'
                  ? 'off'
                  : 'cover-blur';
              setVisualizerAmbientBg(next);
            }}
            title={`Ambient Cover Art: ${
              visualizerAmbientBg === 'cover-blur'
                ? 'Vibrant Bloom'
                : visualizerAmbientBg === 'dim'
                ? 'Subtle Dim'
                : 'Off'
            }`}
            className={`hidden md:flex items-center space-x-1.5 px-2 py-1 rounded-lg border text-[11px] font-mono transition backdrop-blur-md cursor-pointer ${
              visualizerAmbientBg !== 'off'
                ? 'bg-charcoal-900/90 border-crimson-600/70 text-zinc-100 shadow-xs'
                : 'bg-charcoal-900/80 border-charcoal-700/80 text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <ImageIcon
              size={13}
              className={visualizerAmbientBg !== 'off' ? 'text-crimson-400' : 'text-zinc-500'}
            />
            <span className="text-[10px]">
              {visualizerAmbientBg === 'cover-blur'
                ? 'Cover: Bloom'
                : visualizerAmbientBg === 'dim'
                ? 'Cover: Dim'
                : 'Cover: Off'}
            </span>
          </button>

          {/* Toggle Controls Overlay (H) */}
          <button
            onClick={toggleOverlay}
            title={showOverlay ? 'Sembunyikan Menu (H)' : 'Tampilkan Menu (H)'}
            className="p-1.5 bg-charcoal-900/80 border border-charcoal-700/80 text-zinc-300 hover:text-white hover:bg-charcoal-800 rounded-lg transition backdrop-blur-md cursor-pointer"
          >
            {showOverlay ? <Eye size={16} /> : <EyeOff size={16} />}
          </button>

          {/* Toggle Fullscreen */}
          <button
            onClick={toggleFullscreenNative}
            title="Toggle Fullscreen (F)"
            className="p-1.5 bg-charcoal-900/80 border border-charcoal-700/80 text-zinc-300 hover:text-white hover:bg-charcoal-800 rounded-lg transition backdrop-blur-md cursor-pointer"
          >
            {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          </button>

          {/* Close Visualizer */}
          <button
            onClick={() => setOpen(false)}
            title="Close Visualizer (Esc / V)"
            className="p-1.5 bg-crimson-900/70 border border-crimson-700/80 text-white hover:bg-crimson-800 rounded-lg transition backdrop-blur-md shadow-lg cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Floating Bottom Media Bar Overlay (Placed at z-30 with e.stopPropagation() so buttons are ALWAYS clickable) */}
      <div
        onMouseEnter={() => setIsHoveringControls(true)}
        onMouseLeave={() => setIsHoveringControls(false)}
        onClick={(e) => e.stopPropagation()}
        className={`absolute bottom-0 left-0 right-0 z-30 p-3 sm:p-5 bg-gradient-to-t from-black/90 via-black/60 to-transparent transition-opacity duration-300 pointer-events-auto flex items-center justify-between ${
          controlsVisible && showOverlay ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        {/* Track Details */}
        <div className="flex items-center space-x-3 max-w-[40%] truncate">
          <div className="w-11 h-11 sm:w-13 sm:h-13 bg-charcoal-800 rounded-lg overflow-hidden border border-charcoal-700/80 shadow-xl shrink-0 flex items-center justify-center">
            {currentTrack?.artworkId ? (
              <img
                src={api.getArtworkUrl(currentTrack.artworkId, 256)}
                alt={currentTrack.title}
                className="w-full h-full object-cover"
              />
            ) : (
              <Waves size={20} className="text-zinc-600" />
            )}
          </div>

          <div className="flex flex-col truncate">
            <span className="font-semibold text-zinc-100 text-xs sm:text-sm truncate">
              {currentTrack?.title || 'No Track Loaded'}
            </span>
            <span className="text-[11px] text-zinc-400 truncate">
              {currentTrack?.artistName || 'Select a song to start'}
            </span>
            {currentTrack && (
              <span className="font-mono text-[9px] text-zinc-500">
                {formatTime(currentTime)} / {formatTime(duration)}
                {currentTrack.isLossless && ' • FLAC 24-bit'}
              </span>
            )}
          </div>
        </div>

        {/* Central Playback Controls */}
        <div className="flex items-center space-x-2 sm:space-x-3 bg-charcoal-900/90 border border-charcoal-700/80 px-3 py-1.5 rounded-full shadow-2xl backdrop-blur-md">
          <button
            onClick={previous}
            title="Previous Track"
            className="p-1.5 text-zinc-300 hover:text-white rounded-full transition active:scale-90 cursor-pointer"
          >
            <SkipBack size={18} />
          </button>

          <button
            onClick={togglePlay}
            title={isPlaying ? 'Pause' : 'Play'}
            className="p-2.5 rounded-full bg-crimson-600 hover:bg-crimson-500 text-white shadow-lg active:scale-95 transition cursor-pointer"
          >
            {isPlaying ? (
              <Pause size={18} className="fill-white" />
            ) : (
              <Play size={18} className="fill-white translate-x-0.5" />
            )}
          </button>

          <button
            onClick={next}
            title="Next Track"
            className="p-1.5 text-zinc-300 hover:text-white rounded-full transition active:scale-90 cursor-pointer"
          >
            <SkipForward size={18} />
          </button>
        </div>

        {/* Volume & Toggle Overlay */}
        <div className="flex items-center space-x-3">
          <div className="hidden sm:flex items-center space-x-2 bg-charcoal-900/80 border border-charcoal-700/80 px-2.5 py-1.5 rounded-lg backdrop-blur-md">
            <button onClick={toggleMute} className="text-zinc-400 hover:text-white transition cursor-pointer">
              {isMuted || volume === 0 ? <VolumeX size={15} /> : <Volume2 size={15} />}
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={isMuted ? 0 : volume}
              onChange={(e) => setVolume(parseFloat(e.target.value))}
              className="w-20 h-1 bg-charcoal-700 accent-crimson-600 rounded cursor-pointer"
            />
          </div>

          <button
            onClick={toggleOverlay}
            title="Hide Overlay (H) for Ambient View"
            className="p-2 bg-charcoal-900/80 border border-charcoal-700/80 text-zinc-400 hover:text-zinc-200 rounded-lg transition backdrop-blur-md cursor-pointer"
          >
            <EyeOff size={16} />
          </button>
        </div>
      </div>
    </div>
  );
};
