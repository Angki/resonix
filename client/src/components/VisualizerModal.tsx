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
  Eye,
  EyeOff,
  Sliders,
  Sparkles,
} from 'lucide-react';
import { useVisualizerStore, VISUALIZER_MODES, VisualizerTheme } from '../store/visualizerStore';
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

// Particles for starfield and flame
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
  } = usePlayerStore();

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const animFrameIdRef = useRef<number | null>(null);

  // Auto-hide controls overlay on mouse inactivity
  const [isHoveringControls, setIsHoveringControls] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const hideTimerRef = useRef<any>(null);

  // Visualizer states: peak hold bars, particle pool, matrix columns, vinyl rotation
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

    // Initialize particles & matrix columns
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
      const width = canvas.width / (Math.min(window.devicePixelRatio || 1, 2));
      const height = canvas.height / (Math.min(window.devicePixelRatio || 1, 2));

      // Get real audio data from WebAudio service
      const freqData = audioVisualizerService.getFrequencyData();
      const timeData = audioVisualizerService.getTimeDomainData();
      const energy = audioVisualizerService.getEnergyLevels();

      // Clear with dark ambient background
      ctx.fillStyle = '#090a0d';
      ctx.fillRect(0, 0, width, height);

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
      centerGrad.addColorStop(1, 'rgba(5, 5, 8, 0.98)');
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
      eng: { bass: number }
    ) => {
      const barCount = 48;
      const margin = 3;
      const totalWidth = w * 0.92;
      const barWidth = Math.max(3, (totalWidth - (barCount - 1) * margin) / barCount);
      const startX = (w - (barCount * (barWidth + margin) - margin)) / 2;
      const baselineY = h * 0.76;
      const maxHeight = h * 0.52;

      // Update peak arrays
      if (peaksRef.current.length !== barCount) {
        peaksRef.current = new Array(barCount).fill(0);
        peakDecayRef.current = new Array(barCount).fill(0);
      }

      for (let i = 0; i < barCount; i++) {
        // Logarithmic/curved bin lookup for natural audio perception
        const binIndex = Math.min(
          Math.floor(Math.pow(i / barCount, 1.45) * 180),
          data ? data.length - 1 : 0
        );
        const rawVal = data ? data[binIndex] : 0;
        const normalized = Math.min(1, (rawVal / 255) * sensitivity);
        const barHeight = Math.max(4, normalized * maxHeight);

        // Peak drop physics
        if (barHeight >= peaksRef.current[i]) {
          peaksRef.current[i] = barHeight;
          peakDecayRef.current[i] = 0;
        } else {
          peakDecayRef.current[i] += 0.25;
          peaksRef.current[i] = Math.max(0, peaksRef.current[i] - peakDecayRef.current[i]);
        }

        const x = startX + i * (barWidth + margin);
        const y = baselineY - barHeight;

        // Gradient for main bar
        const grad = c.createLinearGradient(0, baselineY, 0, y);
        grad.addColorStop(0, activeTheme.secondary);
        grad.addColorStop(0.7, activeTheme.primary);
        grad.addColorStop(1, activeTheme.accent);

        c.fillStyle = grad;
        c.beginPath();
        c.roundRect(x, y, barWidth, barHeight, [2, 2, 0, 0]);
        c.fill();

        // Floor reflection
        c.fillStyle = `rgba(${activeTheme.rgb.join(',')}, ${0.12 * normalized})`;
        c.beginPath();
        c.roundRect(x, baselineY + 3, barWidth, barHeight * 0.35, [0, 0, 2, 2]);
        c.fill();

        // Peak cap with glow
        const peakY = baselineY - peaksRef.current[i] - 2;
        c.fillStyle = activeTheme.accent;
        c.fillRect(x, peakY, barWidth, 2);
      }

      // Center baseline glow line
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

      // Outer phosphor glow pass
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

      // Sharp core beam pass
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

      // Center crosshair graticule lines
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

      // Inner glowing core
      const coreGrad = c.createRadialGradient(cx, cy, 2, cx, cy, baseRadius);
      coreGrad.addColorStop(0, activeTheme.accent);
      coreGrad.addColorStop(0.5, activeTheme.primary);
      coreGrad.addColorStop(1, 'transparent');
      c.fillStyle = coreGrad;
      c.beginPath();
      c.arc(cx, cy, baseRadius * 0.85, 0, Math.PI * 2);
      c.fill();

      // Circular radiating spikes
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

      // Outer orbiting ring
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
      const speed = (2 + eng.bass * sensitivity * 16);

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

          // Warp streak line
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

      // Base volcanic ember bar
      c.fillStyle = `rgba(${activeTheme.rgb.join(',')}, ${0.4 + eng.bass * 0.4})`;
      c.fillRect(0, baseY - 2, w, 4);
    };

    /* ---------------- MODE 6: VINYL TURNTABLE ---------------- */
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

      // Center Record Label (Center ring)
      c.fillStyle = activeTheme.secondary;
      c.beginPath();
      c.arc(0, 0, radius * 0.35, 0, Math.PI * 2);
      c.fill();

      c.fillStyle = activeTheme.primary;
      c.beginPath();
      c.arc(0, 0, radius * 0.28, 0, Math.PI * 2);
      c.fill();

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

      // Spawn shockwave ring on heavy bass kick
      if (eng.bass > 0.55 && Math.random() < 0.4) {
        shockwaveRingsRef.current.push({
          radius: coreRadius,
          maxRadius: Math.min(w, h) * 0.65,
          alpha: 0.9,
        });
      }

      // Update & render shockwave rings
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

      // Pulsing Event Horizon Void Core
      c.fillStyle = '#000000';
      c.beginPath();
      c.arc(cx, cy, coreRadius, 0, Math.PI * 2);
      c.fill();

      // Outer Corona Plasma Glow
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
      eng: { bass: number }
    ) => {
      const centerY = h * 0.52;
      const step = 4;
      const count = Math.floor(w / step);

      c.beginPath();
      c.moveTo(0, centerY);

      // Top wave
      for (let i = 0; i < count; i++) {
        const bin = Math.min(Math.floor((i / count) * 128), data ? data.length - 1 : 0);
        const v = data ? (data[bin] - 128) / 128 : 0;
        const x = i * step;
        const y = centerY - Math.abs(v) * (h * 0.3) * sensitivity - 4;
        c.lineTo(x, y);
      }

      // Bottom mirrored wave
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

      // Synthwave Sunset Sun
      const sunRadius = Math.min(w, h) * 0.18;
      const sunGrad = c.createLinearGradient(0, horizonY - sunRadius * 2, 0, horizonY);
      sunGrad.addColorStop(0, '#fef08a');
      sunGrad.addColorStop(0.5, activeTheme.accent);
      sunGrad.addColorStop(1, activeTheme.primary);

      c.fillStyle = sunGrad;
      c.beginPath();
      c.arc(cx, horizonY, sunRadius, Math.PI, 0, false);
      c.fill();

      // Horizontal blinds cuts through sun
      c.fillStyle = '#090a0d';
      for (let y = horizonY - sunRadius + 15; y < horizonY; y += 12) {
        c.fillRect(cx - sunRadius, y, sunRadius * 2, 3);
      }

      // Horizon separator beam
      c.strokeStyle = activeTheme.accent;
      c.lineWidth = 2;
      c.beginPath();
      c.moveTo(0, horizonY);
      c.lineTo(w, horizonY);
      c.stroke();

      // 3D Perspective Grid
      c.strokeStyle = `rgba(${activeTheme.rgb.join(',')}, 0.45)`;
      c.lineWidth = 1;

      // Vanishing point perspective lines
      const lineCount = 20;
      for (let i = 0; i <= lineCount; i++) {
        const bottomX = (w / lineCount) * i;
        c.beginPath();
        c.moveTo(cx, horizonY);
        c.lineTo(bottomX, h);
        c.stroke();
      }

      // Moving horizontal grid lines
      for (let y = horizonY + 6; y < h; y += 6 + Math.pow((y - horizonY) / 14, 1.4)) {
        const adjustedY = y + (gridOffsetRef.current * ((y - horizonY) / h));
        if (adjustedY <= h) {
          c.beginPath();
          c.moveTo(0, adjustedY);
          c.lineTo(w, adjustedY);
          c.stroke();
        }
      }
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
      {/* Visualizer Canvas */}
      <canvas
        ref={canvasRef}
        onClick={toggleOverlay}
        className="w-full h-full flex-1 cursor-pointer block"
      />

      {/* Floating Header Controls */}
      <div
        onMouseEnter={() => setIsHoveringControls(true)}
        onMouseLeave={() => setIsHoveringControls(false)}
        className={`absolute top-0 left-0 right-0 p-3 sm:p-4 bg-gradient-to-b from-black/85 via-black/50 to-transparent transition-opacity duration-300 pointer-events-auto flex items-center justify-between ${
          controlsVisible && showOverlay ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        {/* Left: Mode Title & Switcher */}
        <div className="flex items-center space-x-2 sm:space-x-3">
          <div className="flex items-center space-x-1.5 bg-charcoal-900/90 border border-charcoal-700/80 rounded-lg px-2.5 py-1.5 shadow-lg backdrop-blur-md">
            <Waves size={16} className="text-crimson-500 animate-pulse" />
            <div className="flex flex-col">
              <span className="font-semibold text-zinc-100 text-xs tracking-wide">
                {activeModeDef.name}
              </span>
              <span className="font-mono text-[9px] text-zinc-400">
                {activeModeDef.tagline}
              </span>
            </div>
          </div>

          {/* Mode Prev / Next buttons */}
          <div className="flex items-center space-x-1 bg-charcoal-900/80 border border-charcoal-700/80 rounded-lg p-1 backdrop-blur-md">
            <button
              onClick={prevMode}
              title="Previous Mode (Left Arrow)"
              className="p-1 text-zinc-400 hover:text-white hover:bg-charcoal-800 rounded transition"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="font-mono text-[10px] text-zinc-300 px-1.5">
              {mode + 1} / {VISUALIZER_MODES.length}
            </span>
            <button
              onClick={nextMode}
              title="Next Mode (Right Arrow)"
              className="p-1 text-zinc-400 hover:text-white hover:bg-charcoal-800 rounded transition"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>

        {/* Center: Mode Quick Selector Bar (hidden on small mobile) */}
        <div className="hidden lg:flex items-center gap-1 bg-charcoal-900/80 border border-charcoal-700/80 rounded-lg p-1 backdrop-blur-md max-w-xl overflow-x-auto no-scrollbar">
          {VISUALIZER_MODES.map((m) => (
            <button
              key={m.id}
              onClick={() => setMode(m.id)}
              className={`px-2 py-0.5 rounded text-[10px] font-mono transition whitespace-nowrap ${
                mode === m.id
                  ? 'bg-crimson-700 text-white font-bold shadow-xs'
                  : 'text-zinc-400 hover:text-white hover:bg-charcoal-800'
              }`}
            >
              {m.id + 1}. {m.name.split(' ')[0]}
            </button>
          ))}
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
                className={`w-4.5 h-4.5 rounded-full transition transform hover:scale-110 ${
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

          {/* Toggle Fullscreen */}
          <button
            onClick={toggleFullscreenNative}
            title="Toggle Fullscreen (F)"
            className="p-1.5 bg-charcoal-900/80 border border-charcoal-700/80 text-zinc-300 hover:text-white hover:bg-charcoal-800 rounded-lg transition backdrop-blur-md"
          >
            {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          </button>

          {/* Close Visualizer */}
          <button
            onClick={() => setOpen(false)}
            title="Close Visualizer (Esc / V)"
            className="p-1.5 bg-crimson-900/70 border border-crimson-700/80 text-white hover:bg-crimson-800 rounded-lg transition backdrop-blur-md shadow-lg"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Floating Bottom Media Bar Overlay */}
      <div
        onMouseEnter={() => setIsHoveringControls(true)}
        onMouseLeave={() => setIsHoveringControls(false)}
        className={`absolute bottom-0 left-0 right-0 p-3 sm:p-5 bg-gradient-to-t from-black/90 via-black/60 to-transparent transition-opacity duration-300 pointer-events-auto flex items-center justify-between ${
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
            className="p-1.5 text-zinc-300 hover:text-white rounded-full transition active:scale-90"
          >
            <SkipBack size={18} />
          </button>

          <button
            onClick={togglePlay}
            title={isPlaying ? 'Pause' : 'Play'}
            className="p-2.5 rounded-full bg-crimson-600 hover:bg-crimson-500 text-white shadow-lg active:scale-95 transition"
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
            className="p-1.5 text-zinc-300 hover:text-white rounded-full transition active:scale-90"
          >
            <SkipForward size={18} />
          </button>
        </div>

        {/* Volume & Toggle Overlay */}
        <div className="flex items-center space-x-3">
          <div className="hidden sm:flex items-center space-x-2 bg-charcoal-900/80 border border-charcoal-700/80 px-2.5 py-1.5 rounded-lg backdrop-blur-md">
            <button onClick={toggleMute} className="text-zinc-400 hover:text-white transition">
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
            className="p-2 bg-charcoal-900/80 border border-charcoal-700/80 text-zinc-400 hover:text-zinc-200 rounded-lg transition backdrop-blur-md"
          >
            <EyeOff size={16} />
          </button>
        </div>
      </div>
    </div>
  );
};
