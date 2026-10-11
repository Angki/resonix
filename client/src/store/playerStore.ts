import { create } from 'zustand';
import { Track } from '../types';

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
  setCurrentTime: (time: number) => void;
  setDuration: (duration: number) => void;
  setBufferedPercent: (percent: number) => void;
  setSessionId: (id: string | null) => void;
  incrementListenedSeconds: (delta: number) => void;
  resetListenedSeconds: () => void;
}

const STORAGE_KEY = 'black_library_player_state';

function loadPersistedState(): Partial<PlayerState> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
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
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // ignore
  }
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
    });
    persistState(get());
  },

  togglePlay: () => {
    set(state => ({ isPlaying: !state.isPlaying }));
  },

  pause: () => set({ isPlaying: false }),
  resume: () => set({ isPlaying: true }),

  next: () => {
    const { queue, queueIndex, repeatMode, isShuffle } = get();
    if (queue.length === 0) return;

    if (repeatMode === 'one') {
      set({ currentTime: 0, isPlaying: true, listenedSeconds: 0 });
      return;
    }

    let nextIndex = queueIndex + 1;
    if (isShuffle) {
      nextIndex = Math.floor(Math.random() * queue.length);
    } else if (nextIndex >= queue.length) {
      if (repeatMode === 'all') {
        nextIndex = 0;
      } else {
        set({ isPlaying: false });
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
  },

  setVolume: (volume) => {
    set({ volume: Math.max(0, Math.min(1, volume)), isMuted: false });
    persistState(get());
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
    const { queue, queueIndex } = get();
    const before = queue.slice(0, queueIndex + 1);
    const after = queue.slice(queueIndex + 1);
    set({ queue: [...before, ...toAdd, ...after] });
    persistState(get());
  },

  removeFromQueue: (index) => {
    const { queue, queueIndex } = get();
    const updated = queue.filter((_, i) => i !== index);
    let newIndex = queueIndex;
    if (index < queueIndex) newIndex--;
    else if (index === queueIndex && newIndex >= updated.length) newIndex = updated.length - 1;
    set({ queue: updated, queueIndex: newIndex });
    persistState(get());
  },

  clearQueue: () => {
    set({ queue: [], queueIndex: -1 });
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

  setCurrentTime: (time) => set({ currentTime: time }),
  setDuration: (duration) => set({ duration }),
  setBufferedPercent: (percent) => set({ bufferedPercent: percent }),
  setSessionId: (id) => set({ sessionId: id }),
  incrementListenedSeconds: (delta) => set(s => ({ listenedSeconds: s.listenedSeconds + delta })),
  resetListenedSeconds: () => set({ listenedSeconds: 0 }),
}));
