import { create } from 'zustand';

export type VisualizerTheme = 'resonance' | 'crimson' | 'cyber' | 'matrix' | 'abyss' | 'solar' | 'silver';

export interface VisualizerModeDef {
  id: number;
  name: string;
  tagline: string;
  description: string;
}

export const VISUALIZER_MODES: VisualizerModeDef[] = [
  {
    id: 0,
    name: 'Frequency Bars',
    tagline: 'Classic High-Density RTA',
    description: 'Bands with floating peak caps, soft floor reflection, and responsive gravity.',
  },
  {
    id: 1,
    name: 'Laser Oscilloscope',
    tagline: 'CRT Phosphor Beam',
    description: 'Analog vector oscilloscope tracing real-time time-domain audio waveforms.',
  },
  {
    id: 2,
    name: 'Cyber Radial Halo',
    tagline: '360° Circular Pulse',
    description: 'Orbital energy ring radiating frequency spikes with pulsating inner core.',
  },
  {
    id: 3,
    name: 'Nebula Starfield',
    tagline: 'Deep Space Warp',
    description: 'Hyperspace particle field accelerating and detonating to blast-beat kicks.',
  },
  {
    id: 4,
    name: 'Matrix Waterfall',
    tagline: 'Cyberpunk Spectrogram',
    description: 'Cascading digital rain waterfall modulated by frequency bands.',
  },
  {
    id: 5,
    name: 'Inferno Plasma Flame',
    tagline: 'Pyrotechnic Columns',
    description: 'Vertical fire columns with heat gradients and floating ember sparks.',
  },
  {
    id: 6,
    name: 'Vinyl Turntable',
    tagline: 'Analog Micro-Groove',
    description: 'Spinning vinyl record with reactive light grooves reflecting audio dynamics.',
  },
  {
    id: 7,
    name: 'Dark Energy Core',
    tagline: 'Singularity Shockwaves',
    description: 'Abyssal gravity core emitting kinetic shockwave rings on heavy sub-bass.',
  },
  {
    id: 8,
    name: 'Mirror Liquid Wave',
    tagline: 'Fluid Neon Symmetry',
    description: 'Dual mirrored liquid ribbons undulating with harmonic wave physics.',
  },
  {
    id: 9,
    name: 'Retro Synthwave Grid',
    tagline: '3D Wireframe Horizon',
    description: '80s perspective synthwave road undulating to bass beneath a glowing sunset.',
  },
  {
    id: 10,
    name: 'Album Art Pulse',
    tagline: 'Cover Art Spectrum Halo',
    description: 'Floating high-res album cover with audio-reactive bass pulse, 360° frequency spectrum ring, and floor reflection.',
  },
  {
    id: 11,
    name: 'Live Synced Lyrics',
    tagline: 'Audio-Reactive Karaoke',
    description: 'Synchronized live lyrics floating over an audio-reactive particle field with glowing active line tracking.',
  },
  {
    id: 12,
    name: 'Audiophile Stage & VU',
    tagline: 'Hi-Fi Showcase & Dual VU Meters',
    description: 'High-res album artwork on illuminated glass stage with twin analog needle VU ballistic meters, frequency halo, and lossless metadata tags.',
  },
];

interface VisualizerState {
  isOpen: boolean;
  mode: number;
  theme: VisualizerTheme;
  sensitivity: number;
  showOverlay: boolean;
  isFullscreen: boolean;

  setOpen: (open: boolean) => void;
  toggleOpen: () => void;
  setMode: (mode: number) => void;
  nextMode: () => void;
  prevMode: () => void;
  setTheme: (theme: VisualizerTheme) => void;
  setSensitivity: (val: number) => void;
  toggleOverlay: () => void;
  setIsFullscreen: (val: boolean) => void;
}

const STORAGE_KEY = 'black_library_visualizer_prefs';

function loadPersisted() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function persist(state: {
  mode: number;
  theme: VisualizerTheme;
  sensitivity: number;
  showOverlay: boolean;
}) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore
  }
}

const persisted = loadPersisted();

export const useVisualizerStore = create<VisualizerState>((set, get) => ({
  isOpen: false,
  mode: typeof persisted.mode === 'number' && persisted.mode >= 0 && persisted.mode < 13 ? persisted.mode : 0,
  theme: (persisted.theme as VisualizerTheme) || 'crimson',
  sensitivity: typeof persisted.sensitivity === 'number' ? persisted.sensitivity : 1.0,
  showOverlay: true,
  isFullscreen: false,

  setOpen: (open) => {
    if (open) {
      set({ isOpen: true, showOverlay: true });
    } else {
      set({ isOpen: false });
    }
  },
  toggleOpen: () => {
    const next = !get().isOpen;
    if (next) {
      set({ isOpen: true, showOverlay: true });
    } else {
      set({ isOpen: false });
    }
  },

  setMode: (mode) => {
    const clamped = Math.max(0, Math.min(VISUALIZER_MODES.length - 1, mode));
    set({ mode: clamped });
    persist({
      mode: clamped,
      theme: get().theme,
      sensitivity: get().sensitivity,
      showOverlay: get().showOverlay,
    });
  },

  nextMode: () => {
    const next = (get().mode + 1) % VISUALIZER_MODES.length;
    set({ mode: next });
    persist({
      mode: next,
      theme: get().theme,
      sensitivity: get().sensitivity,
      showOverlay: get().showOverlay,
    });
  },

  prevMode: () => {
    const prev = (get().mode - 1 + VISUALIZER_MODES.length) % VISUALIZER_MODES.length;
    set({ mode: prev });
    persist({
      mode: prev,
      theme: get().theme,
      sensitivity: get().sensitivity,
      showOverlay: get().showOverlay,
    });
  },

  setTheme: (theme) => {
    set({ theme });
    persist({
      mode: get().mode,
      theme,
      sensitivity: get().sensitivity,
      showOverlay: get().showOverlay,
    });
  },

  setSensitivity: (val) => {
    const clamped = Math.max(0.5, Math.min(2.5, Math.round(val * 10) / 10));
    set({ sensitivity: clamped });
    persist({
      mode: get().mode,
      theme: get().theme,
      sensitivity: clamped,
      showOverlay: get().showOverlay,
    });
  },

  toggleOverlay: () => {
    const next = !get().showOverlay;
    set({ showOverlay: next });
    persist({
      mode: get().mode,
      theme: get().theme,
      sensitivity: get().sensitivity,
      showOverlay: next,
    });
  },

  setIsFullscreen: (val) => set({ isFullscreen: val }),
}));
