import { create } from 'zustand';

export const EQ_FREQUENCIES = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000] as const;

export interface EqPreset {
  name: string;
  gains: number[];
  description: string;
}

export const EQ_PRESETS: EqPreset[] = [
  {
    name: 'Flat',
    gains: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    description: 'Neutral transparent frequency response',
  },
  {
    name: 'Raw Black Metal',
    gains: [-2, 1, 3, 3, 1, -1, -2, -4, -6, -8],
    description: 'Analog tape warmth, suppresses piercing highs and harsh treble hiss',
  },
  {
    name: 'Dungeon Synth',
    gains: [4, 6, 5, 2, 0, 0, 1, 2, 1, -1],
    description: 'Deep resonant low-end drone, rich atmospheric dungeon reverb warmth',
  },
  {
    name: 'Harsh Noise Control',
    gains: [4, 3, 2, 0, -3, -6, -6, -4, -2, -1],
    description: 'Tames ear-fatiguing resonant screaming frequencies (2k-4k)',
  },
  {
    name: 'Metal Scoop',
    gains: [5, 6, 3, -3, -6, -5, 2, 5, 6, 4],
    description: 'Classic aggressive scooped mids with thunderous double-bass punch',
  },
  {
    name: 'Warm Bass',
    gains: [6, 6, 4, 2, 1, 0, 0, 0, 0, 0],
    description: 'Powerful sub-bass boost without muddying the vocal & lead range',
  },
];

interface EqualizerState {
  isEnabled: boolean;
  gains: number[];
  activePreset: string;
  toggleEnabled: () => void;
  setBandGain: (index: number, gain: number) => void;
  applyPreset: (presetName: string) => void;
  resetFlat: () => void;
}

const STORAGE_KEY = 'black_library_eq_prefs';

function loadPersistedEq(): { isEnabled?: boolean; gains?: number[]; activePreset?: string } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function persistEq(state: { isEnabled: boolean; gains: number[]; activePreset: string }) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore
  }
}

const persisted = loadPersistedEq();

export const useEqualizerStore = create<EqualizerState>((set, get) => ({
  isEnabled: persisted.isEnabled ?? true,
  gains: persisted.gains && persisted.gains.length === 10 ? persisted.gains : [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  activePreset: persisted.activePreset ?? 'Flat',

  toggleEnabled: () => {
    const next = !get().isEnabled;
    set({ isEnabled: next });
    persistEq({ isEnabled: next, gains: get().gains, activePreset: get().activePreset });
  },

  setBandGain: (index, gain) => {
    const clamped = Math.max(-12, Math.min(12, Math.round(gain * 10) / 10));
    const nextGains = [...get().gains];
    nextGains[index] = clamped;
    set({ gains: nextGains, activePreset: 'Custom' });
    persistEq({ isEnabled: get().isEnabled, gains: nextGains, activePreset: 'Custom' });
  },

  applyPreset: (presetName) => {
    const preset = EQ_PRESETS.find(p => p.name === presetName);
    if (preset) {
      set({ gains: [...preset.gains], activePreset: preset.name, isEnabled: true });
      persistEq({ isEnabled: true, gains: [...preset.gains], activePreset: preset.name });
    }
  },

  resetFlat: () => {
    const flat = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    set({ gains: flat, activePreset: 'Flat' });
    persistEq({ isEnabled: get().isEnabled, gains: flat, activePreset: 'Flat' });
  },
}));
