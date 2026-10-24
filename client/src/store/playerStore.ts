import { create } from 'zustand';
import { Track } from '../types';
import { requestSeek } from '../services/playbackBus';

export type RepeatMode = 'off' | 'all' | 'one';

interface PlayerState {
  currentTrack: Track | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  bufferedPercent: number;
  volume: number;
  isMuted: boolean;
  repeatMode: RepeatMode;
  isShuffle: boolean;
  queue: Track[];
  queueIndex: number;
  sessionId: string | null;
  listenedSeconds: number;
  forceTranscode: boolean;
  playNextRemaining: number;
  isCrossfadeEnabled: boolean;
  crossfadeSeconds: number;
  isAutoAdvanceEnabled: boolean;
  autoAdvanceTriggerSeconds: number;

  // Actions
  playTrack: (track: Track, newQueue?: Track[]) => void;
  togglePlay: () => void;
  pause: () => void;
  resume: () => void;
  next: () => void;
  previous: () => void;
  seek: (seconds: number) => void;
  setVolume: (volume: number) => void;
  toggleMute: () => void;
  toggleRepeat: () => void;
  toggleShuffle: () => void;
  addToQueue: (tracks: Track | Track[]) => void;
  playNext: (tracks: Track | Track[]) => void;
  removeFromQueue: (index: number) => void;
  clearQueue: () => void;
  reorderQueue: (fromIndex: number, toIndex: number) => void;
  setForceTranscode: (enabled: boolean) => void;
  setIsCrossfadeEnabled: (enabled: boolean) => void;
  setCrossfadeSeconds: (sec: number) => void;
  setIsAutoAdvanceEnabled: (enabled: boolean) => void;
  setAutoAdvanceTriggerSeconds: (sec: number) => void;
  setCurrentTime: (time: number) => void;
  setDuration: (duration: number) => void;
  setBufferedPercent: (percent: number) => void;
  setSessionId: (id: string | null) => void;
  incrementListenedSeconds: (delta: number) => void;
  resetListenedSeconds: () => void;
}

const STORAGE_KEY = 'resonix_player_state';
const LEGACY_STORAGE_KEY = 'black_library_player_state';

function loadPersistedState(): Partial<PlayerState> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return {
      currentTrack: parsed.currentTrack || null,
      volume: typeof parsed.volume === 'number' ? parsed.volume : 0.8,
      isMuted: !!parsed.isMuted,
      repeatMode: parsed.repeatMode || 'off',
      isShuffle: !!parsed.isShuffle,
      queue: Array.isArray(parsed.queue) ? parsed.queue : [],
      queueIndex: typeof parsed.queueIndex === 'number' ? parsed.queueIndex : -1,
      forceTranscode: !!parsed.forceTranscode,
      playNextRemaining: typeof parsed.playNextRemaining === 'number' ? parsed.playNextRemaining : 0,
      isCrossfadeEnabled: parsed.isCrossfadeEnabled !== undefined ? !!parsed.isCrossfadeEnabled : false,
      crossfadeSeconds: typeof parsed.crossfadeSeconds === 'number' ? parsed.crossfadeSeconds : 3,
      isAutoAdvanceEnabled: parsed.isAutoAdvanceEnabled !== undefined ? !!parsed.isAutoAdvanceEnabled : true,
      autoAdvanceTriggerSeconds: typeof parsed.autoAdvanceTriggerSeconds === 'number' ? parsed.autoAdvanceTriggerSeconds : 1.5,
    };
  } catch {
    return {};
  }
}

function persistState(state: PlayerState) {
  try {
    const payload = {
      currentTrack: state.currentTrack,
      volume: state.volume,
      isMuted: state.isMuted,
      repeatMode: state.repeatMode,
      isShuffle: state.isShuffle,
      queue: state.queue,
      queueIndex: state.queueIndex,
      forceTranscode: state.forceTranscode,
      playNextRemaining: state.playNextRemaining,
      isCrossfadeEnabled: state.isCrossfadeEnabled,
      crossfadeSeconds: state.crossfadeSeconds,
      isAutoAdvanceEnabled: state.isAutoAdvanceEnabled,
      autoAdvanceTriggerSeconds: state.autoAdvanceTriggerSeconds,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // ignore
  }
}

let volumePersistTimer: ReturnType<typeof setTimeout> | null = null;
let lastVolumePersistAt = 0;

// Volume sliders fire continuously; avoid serializing the entire queue on every event
function persistVolume(volume: number, isMuted: boolean) {
  const write = () => {
    lastVolumePersistAt = Date.now();
    try {
      const raw = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...parsed, volume, isMuted }));
    } catch {
      // ignore
    }
  };

  if (Date.now() - lastVolumePersistAt > 250) {
    write();
    return;
  }
  if (volumePersistTimer) clearTimeout(volumePersistTimer);
  volumePersistTimer = setTimeout(() => {
    volumePersistTimer = null;
    const state = usePlayerStore.getState();
    persistVolume(state.volume, state.isMuted);
  }, 250);
}

const persisted = loadPersistedState();

export const usePlayerStore = create<PlayerState>((set, get) => ({
  currentTrack: persisted.currentTrack ?? null,
  isPlaying: false,
  currentTime: 0,
  duration: 0,
  bufferedPercent: 0,
  volume: persisted.volume ?? 0.8,
  isMuted: persisted.isMuted ?? false,
  repeatMode: (persisted.repeatMode as RepeatMode) ?? 'off',
  isShuffle: persisted.isShuffle ?? false,
  queue: persisted.queue ?? [],
  queueIndex: persisted.queueIndex ?? -1,
  sessionId: null,
  listenedSeconds: 0,
  forceTranscode: persisted.forceTranscode ?? false,
  playNextRemaining: persisted.playNextRemaining ?? 0,
  isCrossfadeEnabled: persisted.isCrossfadeEnabled ?? false,
  crossfadeSeconds: persisted.crossfadeSeconds ?? 3,
  isAutoAdvanceEnabled: persisted.isAutoAdvanceEnabled ?? true,
  autoAdvanceTriggerSeconds: persisted.autoAdvanceTriggerSeconds ?? 1.5,

  playTrack: (track, newQueue) => {
    let queue = get().queue;
    let queueIndex = 0;

    if (newQueue && newQueue.length > 0) {
      queue = newQueue;
      queueIndex = queue.findIndex(t => t.id === track.id);
      if (queueIndex === -1) queueIndex = 0;
    } else {
      const idx = queue.findIndex(t => t.id === track.id);
      if (idx !== -1) {
        queueIndex = idx;
      } else {
        queue = [track, ...queue];
        queueIndex = 0;
      }
    }

    set({
      currentTrack: track,
      queue,
      queueIndex,
      isPlaying: true,
      currentTime: 0,
      duration: track.duration,
      sessionId: null,
      listenedSeconds: 0,
      playNextRemaining: 0,
    });
    persistState(get());
  },

  togglePlay: () => {
    set(state => ({ isPlaying: !state.isPlaying }));
  },

  pause: () => set({ isPlaying: false }),
  resume: () => set({ isPlaying: true }),

  next: () => {
    const { queue, queueIndex, repeatMode, isShuffle, playNextRemaining } = get();
    if (queue.length === 0) return;

    if (repeatMode === 'one') {
      set({ currentTime: 0, isPlaying: true, listenedSeconds: 0 });
      return;
    }

    let nextIndex = queueIndex + 1;
    if (playNextRemaining > 0 && nextIndex < queue.length) {
      // Prioritize tracks queued with Play Next in their intended sequence
      set({ playNextRemaining: Math.max(0, playNextRemaining - 1) });
    } else if (isShuffle) {
      nextIndex = Math.floor(Math.random() * queue.length);
    } else if (nextIndex >= queue.length) {
      if (repeatMode === 'all') {
        nextIndex = 0;
      } else {
        set({ isPlaying: false, playNextRemaining: 0 });
        return;
      }
    }

    const nextTrack = queue[nextIndex];
    if (nextTrack) {
      set({
        queueIndex: nextIndex,
        currentTrack: nextTrack,
        isPlaying: true,
        currentTime: 0,
        duration: nextTrack.duration,
        sessionId: null,
        listenedSeconds: 0,
      });
      persistState(get());
    }
  },

  previous: () => {
    const { queue, queueIndex, currentTime } = get();
    if (queue.length === 0) return;

    // If more than 3 seconds in, restart track
    if (currentTime > 3) {
      set({ currentTime: 0, isPlaying: true });
      return;
    }

    let prevIndex = queueIndex - 1;
    if (prevIndex < 0) {
      prevIndex = queue.length - 1;
    }

    const prevTrack = queue[prevIndex];
    if (prevTrack) {
      set({
        queueIndex: prevIndex,
        currentTrack: prevTrack,
        isPlaying: true,
        currentTime: 0,
        duration: prevTrack.duration,
        sessionId: null,
        listenedSeconds: 0,
      });
      persistState(get());
    }
  },

  seek: (seconds) => {
    set({ currentTime: seconds });
    requestSeek(seconds);
  },

  setVolume: (volume) => {
    const next = Math.max(0, Math.min(1, volume));
    set({ volume: next, isMuted: false });
    persistVolume(next, false);
  },

  toggleMute: () => {
    set(state => ({ isMuted: !state.isMuted }));
    persistState(get());
  },

  toggleRepeat: () => {
    const modes: RepeatMode[] = ['off', 'all', 'one'];
    const current = get().repeatMode;
    const nextMode = modes[(modes.indexOf(current) + 1) % modes.length];
    set({ repeatMode: nextMode });
    persistState(get());
  },

  toggleShuffle: () => {
    set(state => ({ isShuffle: !state.isShuffle }));
    persistState(get());
  },

  addToQueue: (tracks) => {
    const toAdd = Array.isArray(tracks) ? tracks : [tracks];
    set(state => ({ queue: [...state.queue, ...toAdd] }));
    persistState(get());
  },

  playNext: (tracks) => {
    const toAdd = Array.isArray(tracks) ? tracks : [tracks];
    if (toAdd.length === 0) return;
    const { queue, queueIndex, playNextRemaining } = get();
    const insertIdx = queueIndex >= 0 ? queueIndex : 0;
    const before = queue.slice(0, insertIdx + 1);
    const after = queue.slice(insertIdx + 1);
    set({
      queue: [...before, ...toAdd, ...after],
      playNextRemaining: (playNextRemaining || 0) + toAdd.length,
    });
    persistState(get());
  },

  removeFromQueue: (index) => {
    const { queue, queueIndex, playNextRemaining } = get();
    const updated = queue.filter((_, i) => i !== index);
    let newIndex = queueIndex;
    if (index < queueIndex) newIndex--;
    else if (index === queueIndex && newIndex >= updated.length) newIndex = updated.length - 1;

    let newPlayNextRemaining = playNextRemaining;
    if (index > queueIndex && index <= queueIndex + playNextRemaining) {
      newPlayNextRemaining = Math.max(0, playNextRemaining - 1);
    }

    set({ queue: updated, queueIndex: newIndex, playNextRemaining: newPlayNextRemaining });
    persistState(get());
  },

  clearQueue: () => {
    set({ queue: [], queueIndex: -1, playNextRemaining: 0 });
    persistState(get());
  },

  reorderQueue: (fromIndex, toIndex) => {
    const { queue, queueIndex } = get();
    const result = Array.from(queue);
    const [removed] = result.splice(fromIndex, 1);
    result.splice(toIndex, 0, removed);

    let newIndex = queueIndex;
    if (queueIndex === fromIndex) newIndex = toIndex;
    else if (fromIndex < queueIndex && toIndex >= queueIndex) newIndex--;
    else if (fromIndex > queueIndex && toIndex <= queueIndex) newIndex++;

    set({ queue: result, queueIndex: newIndex });
    persistState(get());
  },

  setForceTranscode: (enabled) => {
    set({ forceTranscode: enabled });
    persistState(get());
  },

  setIsCrossfadeEnabled: (enabled) => {
    set({ isCrossfadeEnabled: enabled });
    persistState(get());
  },

  setCrossfadeSeconds: (sec) => {
    set({ crossfadeSeconds: sec });
    persistState(get());
  },

  setIsAutoAdvanceEnabled: (enabled) => {
    set({ isAutoAdvanceEnabled: enabled });
    persistState(get());
  },

  setAutoAdvanceTriggerSeconds: (sec) => {
    set({ autoAdvanceTriggerSeconds: sec });
    persistState(get());
  },

  setCurrentTime: (time) => set({ currentTime: time }),
  setDuration: (duration) => set({ duration }),
  setBufferedPercent: (percent) => set({ bufferedPercent: percent }),
  setSessionId: (id) => set({ sessionId: id }),
  incrementListenedSeconds: (delta) => set(s => ({ listenedSeconds: s.listenedSeconds + delta })),
  resetListenedSeconds: () => set({ listenedSeconds: 0 }),
}));
