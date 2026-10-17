import { create } from 'zustand';

export const EQ_FREQUENCIES_10 = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000] as const;
export const EQ_FREQUENCIES_5 = [60, 250, 1000, 4000, 12000] as const;

// 10-band frequencies default export for backward compatibility
export const EQ_FREQUENCIES = EQ_FREQUENCIES_10;

export type EqBandMode = '5-band' | '10-band';
export type EqPresetCategory = 'Metal / Heavy' | 'Ambient / Synth' | 'Audiophile / Acoustic' | 'Utility / Profile';

export interface EqPreset {
  name: string;
  category: EqPresetCategory;
  gains: number[]; // 10-band gains
  description: string;
}

export const EQ_PRESETS: EqPreset[] = [
  // --- Metal / Heavy ---
  {
    name: 'Raw Black Metal',
    category: 'Metal / Heavy',
    gains: [-2, 1, 3, 3, 1, -1, -2, -4, -6, -8],
    description: 'Analog tape warmth, suppresses piercing treble hiss & ear fatigue',
  },
  {
    name: 'Atmospheric BM',
    category: 'Metal / Heavy',
    gains: [2, 3, 2, 0, -1, 1, 3, 4, 3, 2],
    description: 'Deep spatial reverb resonance with crystal shimmers for ambient passages',
  },
  {
    name: 'Death Metal / Blastbeat',
    category: 'Metal / Heavy',
    gains: [4, 6, 4, 1, -2, 1, 4, 5, 4, 2],
    description: 'Punchy double-kick attack, tight low-end, and razor-sharp snare transients',
  },
  {
    name: 'Thrash / Metal Scoop',
    category: 'Metal / Heavy',
    gains: [5, 6, 3, -2, -5, -4, 2, 5, 6, 4],
    description: 'Classic aggressive V-curve with thunderous lows and searing leads',
  },
  {
    name: 'Doom / Sludge Drone',
    category: 'Metal / Heavy',
    gains: [7, 8, 6, 3, 1, -1, -2, -3, -4, -5],
    description: 'Massive crushing sub-bass fuzz, monolithic low-end wall of sound',
  },
  {
    name: 'Harsh Noise Tamer',
    category: 'Metal / Heavy',
    gains: [3, 2, 1, 0, -3, -6, -6, -4, -2, -1],
    description: 'Cuts ear-piercing resonant scream frequencies (2k-4kHz)',
  },

  // --- Ambient / Synth ---
  {
    name: 'Dungeon Synth',
    category: 'Ambient / Synth',
    gains: [4, 6, 5, 2, 0, 0, 1, 2, 1, -1],
    description: 'Deep resonant stone-hall drone with rich nostalgic synthesizer warmth',
  },
  {
    name: 'Synthwave / Retrowave',
    category: 'Ambient / Synth',
    gains: [6, 5, 2, 0, 1, 2, 3, 4, 5, 4],
    description: 'Punchy 80s analog bass, neon arpeggiator sparkle, and punchy snare punch',
  },
  {
    name: 'Dark Ambient',
    category: 'Ambient / Synth',
    gains: [6, 7, 5, 2, 1, 0, -1, -1, 1, 2],
    description: 'Subterranean sub-drone presence with subtle cosmic breath at top end',
  },

  // --- Audiophile / Acoustic ---
  {
    name: 'Flat',
    category: 'Audiophile / Acoustic',
    gains: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    description: 'Completely transparent, unaltered bit-perfect frequency response',
  },
  {
    name: 'Acoustic / Neofolk',
    category: 'Audiophile / Acoustic',
    gains: [1, 2, 1, 0, 1, 2, 3, 4, 3, 2],
    description: 'Natural wooden timbre for nylon guitars, flutes, and organic vocals',
  },
  {
    name: 'Classical / Symphonic',
    category: 'Audiophile / Acoustic',
    gains: [3, 2, 1, 0, 0, 1, 2, 3, 4, 4],
    description: 'Dynamic range preservation, expansive concert hall air and strings',
  },
  {
    name: 'Vocal Clarity',
    category: 'Audiophile / Acoustic',
    gains: [-3, -2, -1, 1, 3, 4, 4, 3, 1, 0],
    description: 'Enhances vocal and lead speech intelligibility while removing chest boom',
  },

  // --- Utility / Sound Profile ---
  {
    name: 'Bass Boost (Heavy)',
    category: 'Utility / Profile',
    gains: [7, 7, 5, 3, 1, 0, 0, 0, 0, 0],
    description: 'Maximum sub-bass slam for headphones and subwoofers',
  },
  {
    name: 'Bass Reducer',
    category: 'Utility / Profile',
    gains: [-6, -5, -4, -2, 0, 0, 0, 0, 0, 0],
    description: 'Cleans up boomy acoustic reflections and muddy headphone resonances',
  },
  {
    name: 'Treble Boost (Air)',
    category: 'Utility / Profile',
    gains: [0, 0, 0, 0, 0, 1, 3, 5, 6, 7],
    description: 'Brings out crisp cymbals, acoustic fingerpicks, and spatial sparkle',
  },
  {
    name: 'Treble Reducer (Dark)',
    category: 'Utility / Profile',
    gains: [0, 0, 0, 0, 0, -2, -3, -5, -6, -8],
    description: 'Silky dark vintage character, completely eliminates ear fatigue',
  },
  {
    name: 'Loudness Contour',
    category: 'Utility / Profile',
    gains: [6, 4, 2, 0, -1, 0, 1, 3, 5, 6],
    description: 'Fletcher-Munson equal-loudness curve for rich sound at lower volumes',
  },
  {
    name: 'Lo-Fi Cassette',
    category: 'Utility / Profile',
    gains: [-8, -4, 2, 4, 4, 3, 1, -2, -6, -10],
    description: 'Narrow vintage magnetic tape bandwidth with rolled-off extremes',
  },
];

interface EqualizerState {
  isEnabled: boolean;
  bandMode: EqBandMode;
  gains: number[]; // 10-band gains (underlying DSP)
  gains5: number[]; // 5-band representation
  preAmp: number;
  activePreset: string;
  isNormalizerEnabled: boolean;
  isCrossfeedEnabled: boolean;

  toggleEnabled: () => void;
  toggleNormalizer: () => void;
  setNormalizerEnabled: (enabled: boolean) => void;
  toggleCrossfeed: () => void;
  setCrossfeedEnabled: (enabled: boolean) => void;
  setBandMode: (mode: EqBandMode) => void;
  setBandGain10: (index: number, gain: number) => void;
  setBandGain5: (index: number, gain: number) => void;
  setPreAmp: (gain: number) => void;
  applyPreset: (presetName: string) => void;
  resetFlat: () => void;
}

const STORAGE_KEY = 'black_library_eq_prefs_v2';

// Map 5-band sliders to 10-band underlying gains
export function map5To10Gains(gains5: number[]): number[] {
  const [b0, b1, b2, b3, b4] = gains5;
  return [
    b0, // 32
    b0, // 64
    b1 * 0.8 + b0 * 0.2, // 125
    b1, // 250
    b2 * 0.7 + b1 * 0.3, // 500
    b2, // 1k
    b3 * 0.7 + b2 * 0.3, // 2k
    b3, // 4k
    b4 * 0.7 + b3 * 0.3, // 8k
    b4, // 16k
  ].map((v) => Math.round(v * 10) / 10);
}

// Sample 10-band to 5-band
export function map10To5Gains(gains10: number[]): number[] {
  return [
    Math.round(((gains10[0] + gains10[1]) / 2) * 10) / 10, // 60Hz
    Math.round(((gains10[2] + gains10[3]) / 2) * 10) / 10, // 250Hz
    Math.round(((gains10[4] + gains10[5]) / 2) * 10) / 10, // 1kHz
    Math.round(((gains10[6] + gains10[7]) / 2) * 10) / 10, // 4kHz
    Math.round(((gains10[8] + gains10[9]) / 2) * 10) / 10, // 12kHz
  ];
}

function loadPersistedEq() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY) || localStorage.getItem('black_library_eq_prefs');
    if (!raw) return {};
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function persistEq(state: {
  isEnabled: boolean;
  bandMode: EqBandMode;
  gains: number[];
  gains5: number[];
  preAmp: number;
  activePreset: string;
  isNormalizerEnabled: boolean;
  isCrossfeedEnabled: boolean;
}) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore
  }
}

const persisted = loadPersistedEq();
const initialGains10 =
  persisted.gains && persisted.gains.length === 10
    ? persisted.gains
    : [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
const initialGains5 =
  persisted.gains5 && persisted.gains5.length === 5
    ? persisted.gains5
    : map10To5Gains(initialGains10);

export const useEqualizerStore = create<EqualizerState>((set, get) => ({
  isEnabled: persisted.isEnabled ?? true,
  bandMode: (persisted.bandMode as EqBandMode) ?? '10-band',
  gains: initialGains10,
  gains5: initialGains5,
  preAmp: typeof persisted.preAmp === 'number' ? persisted.preAmp : 0,
  activePreset: persisted.activePreset ?? 'Flat',
  isNormalizerEnabled: persisted.isNormalizerEnabled ?? false,
  isCrossfeedEnabled: persisted.isCrossfeedEnabled ?? false,

  toggleEnabled: () => {
    const next = !get().isEnabled;
    set({ isEnabled: next });
    persistEq({
      isEnabled: next,
      bandMode: get().bandMode,
      gains: get().gains,
      gains5: get().gains5,
      preAmp: get().preAmp,
      activePreset: get().activePreset,
      isNormalizerEnabled: get().isNormalizerEnabled,
      isCrossfeedEnabled: get().isCrossfeedEnabled,
    });
  },

  toggleNormalizer: () => {
    const next = !get().isNormalizerEnabled;
    set({ isNormalizerEnabled: next });
    persistEq({
      isEnabled: get().isEnabled,
      bandMode: get().bandMode,
      gains: get().gains,
      gains5: get().gains5,
      preAmp: get().preAmp,
      activePreset: get().activePreset,
      isNormalizerEnabled: next,
      isCrossfeedEnabled: get().isCrossfeedEnabled,
    });
  },

  setNormalizerEnabled: (enabled: boolean) => {
    set({ isNormalizerEnabled: enabled });
    persistEq({
      isEnabled: get().isEnabled,
      bandMode: get().bandMode,
      gains: get().gains,
      gains5: get().gains5,
      preAmp: get().preAmp,
      activePreset: get().activePreset,
      isNormalizerEnabled: enabled,
      isCrossfeedEnabled: get().isCrossfeedEnabled,
    });
  },

  toggleCrossfeed: () => {
    const next = !get().isCrossfeedEnabled;
    set({ isCrossfeedEnabled: next });
    persistEq({
      isEnabled: get().isEnabled,
      bandMode: get().bandMode,
      gains: get().gains,
      gains5: get().gains5,
      preAmp: get().preAmp,
      activePreset: get().activePreset,
      isNormalizerEnabled: get().isNormalizerEnabled,
      isCrossfeedEnabled: next,
    });
  },

  setCrossfeedEnabled: (enabled: boolean) => {
    set({ isCrossfeedEnabled: enabled });
    persistEq({
      isEnabled: get().isEnabled,
      bandMode: get().bandMode,
      gains: get().gains,
      gains5: get().gains5,
      preAmp: get().preAmp,
      activePreset: get().activePreset,
      isNormalizerEnabled: get().isNormalizerEnabled,
      isCrossfeedEnabled: enabled,
    });
  },

  setBandMode: (mode) => {
    set({ bandMode: mode });
    persistEq({
      isEnabled: get().isEnabled,
      bandMode: mode,
      gains: get().gains,
      gains5: get().gains5,
      preAmp: get().preAmp,
      activePreset: get().activePreset,
      isNormalizerEnabled: get().isNormalizerEnabled,
      isCrossfeedEnabled: get().isCrossfeedEnabled,
    });
  },

  setBandGain10: (index, gain) => {
    const clamped = Math.max(-12, Math.min(12, Math.round(gain * 10) / 10));
    const nextGains10 = [...get().gains];
    nextGains10[index] = clamped;
    const nextGains5 = map10To5Gains(nextGains10);

    set({ gains: nextGains10, gains5: nextGains5, activePreset: 'Custom' });
    persistEq({
      isEnabled: get().isEnabled,
      bandMode: get().bandMode,
      gains: nextGains10,
      gains5: nextGains5,
      preAmp: get().preAmp,
      activePreset: 'Custom',
      isNormalizerEnabled: get().isNormalizerEnabled,
      isCrossfeedEnabled: get().isCrossfeedEnabled,
    });
  },

  setBandGain5: (index, gain) => {
    const clamped = Math.max(-12, Math.min(12, Math.round(gain * 10) / 10));
    const nextGains5 = [...get().gains5];
    nextGains5[index] = clamped;
    const nextGains10 = map5To10Gains(nextGains5);

    set({ gains: nextGains10, gains5: nextGains5, activePreset: 'Custom' });
    persistEq({
      isEnabled: get().isEnabled,
      bandMode: get().bandMode,
      gains: nextGains10,
      gains5: nextGains5,
      preAmp: get().preAmp,
      activePreset: 'Custom',
      isNormalizerEnabled: get().isNormalizerEnabled,
      isCrossfeedEnabled: get().isCrossfeedEnabled,
    });
  },

  setPreAmp: (gain) => {
    const clamped = Math.max(-6, Math.min(6, Math.round(gain * 10) / 10));
    set({ preAmp: clamped });
    persistEq({
      isEnabled: get().isEnabled,
      bandMode: get().bandMode,
      gains: get().gains,
      gains5: get().gains5,
      preAmp: clamped,
      activePreset: get().activePreset,
      isNormalizerEnabled: get().isNormalizerEnabled,
      isCrossfeedEnabled: get().isCrossfeedEnabled,
    });
  },

  applyPreset: (presetName) => {
    const preset = EQ_PRESETS.find((p) => p.name === presetName);
    if (preset) {
      const nextGains10 = [...preset.gains];
      const nextGains5 = map10To5Gains(nextGains10);
      set({
        gains: nextGains10,
        gains5: nextGains5,
        activePreset: preset.name,
        isEnabled: true,
      });
      persistEq({
        isEnabled: true,
        bandMode: get().bandMode,
        gains: nextGains10,
        gains5: nextGains5,
        preAmp: get().preAmp,
        activePreset: preset.name,
        isNormalizerEnabled: get().isNormalizerEnabled,
        isCrossfeedEnabled: get().isCrossfeedEnabled,
      });
    }
  },

  resetFlat: () => {
    const flat10 = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    const flat5 = [0, 0, 0, 0, 0];
    set({ gains: flat10, gains5: flat5, preAmp: 0, activePreset: 'Flat' });
    persistEq({
      isEnabled: get().isEnabled,
      bandMode: get().bandMode,
      gains: flat10,
      gains5: flat5,
      preAmp: 0,
      activePreset: 'Flat',
      isNormalizerEnabled: get().isNormalizerEnabled,
      isCrossfeedEnabled: get().isCrossfeedEnabled,
    });
  },
}));


