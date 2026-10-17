import { Track } from '../types';

const AUDIO_CACHE_NAME = 'audio-cache-v1';
const OFFLINE_METADATA_KEY = 'black_library_offline_tracks';

class OfflineStorageService {
  private offlineTracksMap: Map<string, Track> = new Map();
  private listeners: Set<() => void> = new Set();
  private isLoaded = false;

  constructor() {
    this.loadPersistedTracks();
  }

  private loadPersistedTracks() {
    try {
      const raw = localStorage.getItem(OFFLINE_METADATA_KEY);
      if (raw) {
        const parsed: Track[] = JSON.parse(raw);
        this.offlineTracksMap = new Map(parsed.map(t => [t.id, t]));
      }
    } catch (e) {
      console.warn('Failed to load offline tracks metadata:', e);
    }
    this.isLoaded = true;
  }

  private persistTracks() {
    try {
      const list = Array.from(this.offlineTracksMap.values());
      localStorage.setItem(OFFLINE_METADATA_KEY, JSON.stringify(list));
      this.notifyListeners();
    } catch (e) {
      console.warn('Failed to save offline tracks metadata:', e);
    }
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notifyListeners() {
    this.listeners.forEach(fn => fn());
  }

  public isOffline(trackId: string): boolean {
    if (!this.isLoaded) this.loadPersistedTracks();
    return this.offlineTracksMap.has(trackId);
  }

  public getOfflineTracks(): Track[] {
    if (!this.isLoaded) this.loadPersistedTracks();
    return Array.from(this.offlineTracksMap.values());
  }

  public getOfflineCount(): number {
    if (!this.isLoaded) this.loadPersistedTracks();
    return this.offlineTracksMap.size;
  }

  /**
   * Downloads and caches the audio stream for a track into CacheStorage
   */
  public async saveTrack(track: Track): Promise<boolean> {
    if (!('caches' in window)) return false;

    try {
      const streamUrl = `/api/stream/${track.id}`;
      const cache = await caches.open(AUDIO_CACHE_NAME);

      // Check if already in cache
      const existing = await cache.match(streamUrl);
      if (!existing) {
        const response = await fetch(streamUrl);
        if (!response.ok) {
          throw new Error(`Failed to fetch audio stream: ${response.status}`);
        }
        await cache.put(streamUrl, response);
      }

      this.offlineTracksMap.set(track.id, track);
      this.persistTracks();
      return true;
    } catch (err) {
      console.error(`Failed to cache track ${track.title} for offline:`, err);
      return false;
    }
  }

  /**
   * Removes track audio from CacheStorage
   */
  public async removeTrack(trackId: string): Promise<boolean> {
    if (!('caches' in window)) return false;

    try {
      const streamUrl = `/api/stream/${trackId}`;
      const cache = await caches.open(AUDIO_CACHE_NAME);
      await cache.delete(streamUrl);

      this.offlineTracksMap.delete(trackId);
      this.persistTracks();
      return true;
    } catch (err) {
      console.error(`Failed to remove offline track ${trackId}:`, err);
      return false;
    }
  }

  /**
   * Batch caches all tracks of an album
   */
  public async saveAlbum(tracks: Track[], onProgress?: (current: number, total: number) => void): Promise<number> {
    let saved = 0;
    for (let i = 0; i < tracks.length; i++) {
      const track = tracks[i];
      const ok = await this.saveTrack(track);
      if (ok) saved++;
      if (onProgress) {
        onProgress(i + 1, tracks.length);
      }
    }
    return saved;
  }

  /**
   * Estimates available disk quota and current usage
   */
  public async getStorageQuota(): Promise<{ availableMB: number; usageMB: number; percentUsed: number }> {
    if (navigator.storage && navigator.storage.estimate) {
      try {
        const { quota, usage } = await navigator.storage.estimate();
        const availableMB = Math.round(((quota || 0) - (usage || 0)) / (1024 * 1024));
        const usageMB = Math.round((usage || 0) / (1024 * 1024));
        const percentUsed = quota ? Math.min(100, Math.round(((usage || 0) / quota) * 100)) : 0;
        return { availableMB, usageMB, percentUsed };
      } catch {
        // Fallback
      }
    }
    return { availableMB: 10240, usageMB: 0, percentUsed: 0 };
  }

  /**
   * Clears the entire audio cache
   */
  public async clearAll(): Promise<void> {
    if ('caches' in window) {
      try {
        await caches.delete(AUDIO_CACHE_NAME);
      } catch (e) {
        console.warn('Failed to delete audio cache:', e);
      }
    }
    this.offlineTracksMap.clear();
    this.persistTracks();
  }
}

export const offlineStorageService = new OfflineStorageService();
