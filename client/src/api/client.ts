import { Track, Artist, Album, Playlist, ScanStatus, User, MusicBeeCandidate } from '../types';

async function fetchJson<T>(url: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers || {});
  headers.set('X-Requested-With', 'BlackLibraryClient');
  if (options.body && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  const res = await fetch(url, {
    ...options,
    headers,
    credentials: 'include',
  });

  if (!res.ok) {
    let errorMsg = `HTTP Error ${res.status}`;
    try {
      const data = await res.json();
      if (data.error) errorMsg = data.error;
    } catch {
      // ignore
    }
    throw new Error(errorMsg);
  }

  return res.json();
}

export const api = {
  // Auth
  getAuthStatus: () => fetchJson<{ needsSetup: boolean; authenticated: boolean; user?: User }>('/api/auth/status'),
  setupAdmin: (body: { username: string; password: string }) =>
    fetchJson<{ success: boolean; user: User }>('/api/auth/setup', { method: 'POST', body: JSON.stringify(body) }),
  login: (body: { username: string; password: string }) =>
    fetchJson<{ success: boolean; user: User }>('/api/auth/login', { method: 'POST', body: JSON.stringify(body) }),
  logout: () => fetchJson<{ success: boolean }>('/api/auth/logout', { method: 'POST' }),
  getMe: () => fetchJson<{ user: User }>('/api/auth/me'),

  // Library
  getRoots: () => fetchJson<Array<{ id: string; name: string; path: string; isEnabled: boolean; trackCount: number }>>('/api/library/roots'),
  triggerScan: (rootId?: string) => fetchJson<{ success: boolean; status: ScanStatus }>('/api/library/scan', { method: 'POST', body: JSON.stringify({ rootId }) }),
  cancelScan: () => fetchJson<{ success: boolean }>('/api/library/scan/cancel', { method: 'POST' }),
  getScanStatus: () => fetchJson<ScanStatus>('/api/library/status'),
  getLibraryStats: () => fetchJson<{ totalTracks: number; totalArtists: number; totalAlbums: number; totalPlaylists: number; totalDurationSeconds: number; totalFileSizeBytes: string }>('/api/library/stats'),

  // Tracks & Browsing
  getTracks: (params: Record<string, string | number | boolean | undefined> = {}) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== '') q.set(k, String(v));
    }
    return fetchJson<{ total: number; page: number; limit: number; tracks: Track[] }>(`/api/tracks?${q.toString()}`);
  },
  getTrack: (id: string) => fetchJson<Track>(`/api/tracks/${id}`),
  getArtists: () => fetchJson<Artist[]>('/api/tracks/artists'),
  getAlbums: (params?: { artistId?: string; rootId?: string; search?: string; searchField?: string; sortBy?: string; sortOrder?: 'asc' | 'desc' } | string, rootId?: string) => {
    const q = new URLSearchParams();
    if (typeof params === 'string') {
      if (params) q.set('artistId', params);
      if (rootId) q.set('rootId', rootId);
    } else if (params) {
      if (params.artistId) q.set('artistId', params.artistId);
      if (params.rootId) q.set('rootId', params.rootId);
      if (params.search) q.set('search', params.search);
      if (params.searchField) q.set('searchField', params.searchField);
      if (params.sortBy) q.set('sortBy', params.sortBy);
      if (params.sortOrder) q.set('sortOrder', params.sortOrder);
    }
    const qs = q.toString() ? `?${q.toString()}` : '';
    return fetchJson<Album[]>(`/api/tracks/albums${qs}`);
  },
  getGenres: () => fetchJson<Array<{ genre: string; count: number }>>('/api/tracks/genres'),

  // Playback
  startPlayback: (trackId: string) =>
    fetchJson<{ sessionId: string; startedAt: string }>('/api/playback/start', { method: 'POST', body: JSON.stringify({ trackId }) }),
  reportProgress: (body: { trackId: string; sessionId: string; listenedSeconds: number; eventId: string }) =>
    fetchJson<{ status: string; thresholdReached: boolean; playCountIncremented?: boolean }>('/api/playback/progress', { method: 'POST', body: JSON.stringify(body) }),
  toggleFavorite: (trackId: string) =>
    fetchJson<{ trackId: string; isFavorite: boolean }>('/api/playback/favorite', { method: 'POST', body: JSON.stringify({ trackId }) }),
  setRating: (trackId: string, rating: number | null) =>
    fetchJson<{ trackId: string; rating: number | null }>('/api/playback/rate', { method: 'POST', body: JSON.stringify({ trackId, rating }) }),
  getHistory: () => fetchJson<Array<{ trackId: string; title: string; artistName: string; albumTitle: string; duration: number; lastPlayedAt: string; playCount: number }>>('/api/playback/history'),

  // Playlists
  getPlaylists: () => fetchJson<Playlist[]>('/api/playlists'),
  createPlaylist: (body: { name: string; description?: string }) =>
    fetchJson<Playlist>('/api/playlists', { method: 'POST', body: JSON.stringify(body) }),
  getPlaylist: (id: string) => fetchJson<{ id: string; name: string; description?: string; isSmart: boolean; tracks: Track[] }>(`/api/playlists/${id}`),
  addTracksToPlaylist: (playlistId: string, trackIds: string[]) =>
    fetchJson<{ success: boolean; addedCount: number }>(`/api/playlists/${playlistId}/tracks`, { method: 'POST', body: JSON.stringify({ trackIds }) }),
  removeTrackFromPlaylist: (playlistId: string, trackId: string) =>
    fetchJson<{ success: boolean }>(`/api/playlists/${playlistId}/tracks/${trackId}`, { method: 'DELETE' }),

  // MusicBee
  getMusicBeeCandidates: () => fetchJson<{ discoveryPath: string; candidates: MusicBeeCandidate[]; pastImports: any[] }>('/api/musicbee/candidates'),
  previewMusicBeePlaylist: (filePath: string) =>
    fetchJson<{ playlistName: string; total: number; matchedCount: number; unmatchedCount: number; matchedTracks: any[]; unmatchedSample: string[] }>('/api/musicbee/preview', { method: 'POST', body: JSON.stringify({ filePath }) }),
  importMusicBeePlaylist: (filePath: string) =>
    fetchJson<{ success: boolean; playlistId: string; playlistName: string; tracksImported: number; unmatchedCount: number }>('/api/musicbee/import', { method: 'POST', body: JSON.stringify({ filePath }) }),

  // Last.fm
  getLastFmStatus: () => fetchJson<{ hasApiKeysConfigured: boolean; isConnected: boolean; username: string | null; isScrobblingEnabled: boolean; pendingCount: number; recentJobs: any[] }>('/api/lastfm/status'),
  getLastFmAuthUrl: () => fetchJson<{ token: string; authUrl: string }>('/api/lastfm/auth-url'),
  completeLastFmCallback: (token: string) => fetchJson<{ success: boolean; username: string }>('/api/lastfm/callback', { method: 'POST', body: JSON.stringify({ token }) }),
  disconnectLastFm: () => fetchJson<{ success: boolean }>('/api/lastfm/disconnect', { method: 'POST' }),
  toggleLastFmScrobble: () => fetchJson<{ isScrobblingEnabled: boolean }>('/api/lastfm/toggle-scrobble', { method: 'POST' }),

  // Settings
  getSettings: () => fetchJson<{ settings: Record<string, string>; system: any }>('/api/settings'),
  saveSettings: (body: Record<string, string>) => fetchJson<{ success: boolean }>('/api/settings', { method: 'POST', body: JSON.stringify(body) }),

  // Helpers
  getStreamUrl: (trackId: string, transcode: boolean = false) =>
    transcode ? `/api/stream/${trackId}/transcode` : `/api/stream/${trackId}`,
  getArtworkUrl: (artworkId?: string, size: 96 | 256 | 512 = 256) =>
    artworkId ? `/api/artwork/${artworkId}?size=${size}` : `/api/artwork/unknown?size=${size}`,
  getTrackArtworkUrl: (trackId: string, size: 96 | 256 | 512 = 256) =>
    `/api/artwork/track/${trackId}?size=${size}`,
};
