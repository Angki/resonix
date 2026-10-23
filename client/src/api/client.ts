import { Track, Artist, Album, Playlist, ScanStatus, User, ExternalPlaylistCandidate, MusicBeeCandidate, ArtistListItem, ArtistDetail, ArtistBatchStatus, LyricsData, SmartPlaylistPreset, SmartPlaylistDetail, SimilarArtistsResponse, AlbumScan, LibraryAuditResult, LibraryHealthOverview, HealthIssueType, HealthIssueDetail, IgnoredHealthIssue, VerifyLibraryFilesResult } from '../types';

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
  getArtistsList: (params: { search?: string; sortBy?: 'name' | 'albumCount' | 'trackCount' | 'totalPlays'; order?: 'asc' | 'desc'; limit?: number; offset?: number; rootId?: string } = {}) => {
    const q = new URLSearchParams();
    if (params.search) q.set('search', params.search);
    if (params.sortBy) q.set('sortBy', params.sortBy);
    if (params.order) q.set('order', params.order);
    if (params.limit) q.set('limit', String(params.limit));
    if (params.offset) q.set('offset', String(params.offset));
    if (params.rootId) q.set('rootId', params.rootId);
    const qs = q.toString() ? `?${q.toString()}` : '';
    return fetchJson<ArtistListItem[]>(`/api/artists${qs}`);
  },
  getArtistDetail: (id: string, rootId?: string) =>
    fetchJson<ArtistDetail>(`/api/artists/${id}${rootId ? `?rootId=${encodeURIComponent(rootId)}` : ''}`),
  getArtistPhotoUrl: (id: string) => `/api/artists/${id}/photo`,
  getArtistLogoUrl: (id: string) => `/api/artists/${id}/logo`,
  fetchArtistArt: (id: string, force = true) =>
    fetchJson<{ ok: boolean; data: any }>(`/api/artists/${id}/fetch-art`, {
      method: 'POST',
      body: JSON.stringify({ force }),
    }),
  getArtistBatchStatus: () => fetchJson<ArtistBatchStatus>('/api/artists/batch-status'),
  startArtistBatchFetch: (action: 'start' | 'pause' = 'start', force = false) =>
    fetchJson<{ ok: boolean; status: string }>('/api/artists/batch-fetch', {
      method: 'POST',
      body: JSON.stringify({ action, force }),
    }),
  getArtists: (params?: { rootId?: string }) =>
    fetchJson<Artist[]>(`/api/tracks/artists${params?.rootId ? `?rootId=${encodeURIComponent(params.rootId)}` : ''}`),
  getAlbums: (params?: { artistId?: string; rootId?: string; search?: string; searchField?: string; sortBy?: string; sortOrder?: 'asc' | 'desc'; quality?: string } | string, rootId?: string) => {
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
      if (params.quality) q.set('quality', params.quality);
    }
    const qs = q.toString() ? `?${q.toString()}` : '';
    return fetchJson<Album[]>(`/api/tracks/albums${qs}`);
  },
  getGenres: () => fetchJson<Array<{ genre: string; count: number }>>('/api/tracks/genres'),

  // Playback
  startPlayback: (trackId: string) =>
    fetchJson<{ sessionId: string; startedAt: string }>('/api/playback/start', { method: 'POST', body: JSON.stringify({ trackId }) }),
  reportProgress: (body: { trackId: string; sessionId: string; listenedSeconds: number; eventId: string }) =>
    fetchJson<{ status: string; thresholdReached: boolean; playCountIncremented?: boolean; isCompleted?: boolean }>('/api/playback/progress', { method: 'POST', body: JSON.stringify(body) }),
  toggleFavorite: (trackId: string) =>
    fetchJson<{ trackId: string; isFavorite: boolean }>('/api/playback/favorite', { method: 'POST', body: JSON.stringify({ trackId }) }),
  setRating: (trackId: string, rating: number | null) =>
    fetchJson<{ trackId: string; rating: number | null }>('/api/playback/rate', { method: 'POST', body: JSON.stringify({ trackId, rating }) }),
  getHistory: (limit: number = 100) =>
    fetchJson<Array<{
      trackId: string;
      id: string;
      title: string;
      artistName: string;
      albumTitle: string;
      duration: number;
      isLossless: boolean;
      codec?: string;
      bitrate?: number;
      artworkId?: string;
      lastPlayedAt: string;
      playCount: number;
      totalListeningTime: number;
      isFavorite: boolean;
      rating: number | null;
      track?: Track;
    }>>(`/api/playback/history?limit=${limit}`),
  getPlaybackStats: () =>
    fetchJson<{
      totalListeningHours: number;
      totalPlays: number;
      uniqueTracks: number;
      uniqueArtists: number;
      losslessPercentage: number;
      dailyActivity: Array<{ date: string; label: string; count: number; minutes: number }>;
      topArtists: Array<{ name: string; playCount: number; minutes: number }>;
      topGenres: Array<{ name: string; count: number }>;
    }>('/api/playback/stats'),

  // Playlists
  getPlaylists: () => fetchJson<Playlist[]>('/api/playlists'),
  createPlaylist: (body: { name: string; description?: string }) =>
    fetchJson<Playlist>('/api/playlists', { method: 'POST', body: JSON.stringify(body) }),
  getPlaylist: (id: string) => fetchJson<{ id: string; name: string; description?: string; isSmart: boolean; tracks: Track[] }>(`/api/playlists/${id}`),
  addTracksToPlaylist: (playlistId: string, trackIds: string[]) =>
    fetchJson<{ success: boolean; addedCount: number }>(`/api/playlists/${playlistId}/tracks`, { method: 'POST', body: JSON.stringify({ trackIds }) }),
  removeTrackFromPlaylist: (playlistId: string, trackId: string) =>
    fetchJson<{ success: boolean }>(`/api/playlists/${playlistId}/tracks/${trackId}`, { method: 'DELETE' }),

  // External Playlists (.mbp / .m3u / .xautopf)
  getExternalPlaylistCandidates: () => fetchJson<{ discoveryPath: string; candidates: ExternalPlaylistCandidate[]; pastImports: any[] }>('/api/external-playlists/candidates'),
  previewExternalPlaylist: (filePath: string) =>
    fetchJson<{ playlistName: string; total: number; matchedCount: number; unmatchedCount: number; matchedTracks: any[]; unmatchedSample: string[] }>('/api/external-playlists/preview', { method: 'POST', body: JSON.stringify({ filePath }) }),
  importExternalPlaylist: (filePath: string) =>
    fetchJson<{ success: boolean; playlistId: string; playlistName: string; tracksImported: number; unmatchedCount: number }>('/api/external-playlists/import', { method: 'POST', body: JSON.stringify({ filePath }) }),

  // Backwards-compatible aliases
  getMusicBeeCandidates: () => fetchJson<{ discoveryPath: string; candidates: MusicBeeCandidate[]; pastImports: any[] }>('/api/external-playlists/candidates'),
  previewMusicBeePlaylist: (filePath: string) =>
    fetchJson<{ playlistName: string; total: number; matchedCount: number; unmatchedCount: number; matchedTracks: any[]; unmatchedSample: string[] }>('/api/external-playlists/preview', { method: 'POST', body: JSON.stringify({ filePath }) }),
  importMusicBeePlaylist: (filePath: string) =>
    fetchJson<{ success: boolean; playlistId: string; playlistName: string; tracksImported: number; unmatchedCount: number }>('/api/external-playlists/import', { method: 'POST', body: JSON.stringify({ filePath }) }),

  // Last.fm
  getLastFmStatus: () => fetchJson<{ hasApiKeysConfigured: boolean; isConnected: boolean; username: string | null; isScrobblingEnabled: boolean; pendingCount: number; recentJobs: any[] }>('/api/lastfm/status'),
  getLastFmAuthUrl: () => fetchJson<{ token: string; authUrl: string }>('/api/lastfm/auth-url'),
  completeLastFmCallback: (token: string) => fetchJson<{ success: boolean; username: string }>('/api/lastfm/callback', { method: 'POST', body: JSON.stringify({ token }) }),
  disconnectLastFm: () => fetchJson<{ success: boolean }>('/api/lastfm/disconnect', { method: 'POST' }),
  toggleLastFmScrobble: () => fetchJson<{ isScrobblingEnabled: boolean }>('/api/lastfm/toggle-scrobble', { method: 'POST' }),
  syncAlbumLastFm: (albumId: string) =>
    fetchJson<{ success: boolean; totalTracks: number; syncedCount: number; updates: Array<{ trackId: string; playCount: number }> }>(
      '/api/lastfm/sync-album',
      { method: 'POST', body: JSON.stringify({ albumId }) }
    ),
  syncArtistLastFm: (artistId: string, rootId?: string) =>
    fetchJson<{ success: boolean; totalTracks: number; syncedCount: number; updates: Array<{ trackId: string; playCount: number }> }>(
      '/api/lastfm/sync-artist',
      { method: 'POST', body: JSON.stringify({ artistId, rootId }) }
    ),
  syncTrackLastFm: (trackId: string) =>
    fetchJson<{ success: boolean; trackId: string; playCount: number }>(
      '/api/lastfm/sync-track',
      { method: 'POST', body: JSON.stringify({ trackId }) }
    ),
  syncLibraryLastFm: (limit = 1000) =>
    fetchJson<{ success: boolean; fetchedTracks: number; matchedTracks: number; updatedTracks: number }>(
      '/api/lastfm/sync-library',
      { method: 'POST', body: JSON.stringify({ limit }) }
    ),

  // Settings
  getSettings: () => fetchJson<{ settings: Record<string, string>; system: any; subsonic?: any }>('/api/settings'),
  saveSettings: (body: Record<string, string>) => fetchJson<{ success: boolean }>('/api/settings', { method: 'POST', body: JSON.stringify(body) }),
  restartServer: () => fetchJson<{ success: boolean; message: string }>('/api/settings/restart', { method: 'POST' }),
  updateSubsonicPassword: (password: string) =>
    fetchJson<{ success: boolean; message: string }>('/api/settings/subsonic/password', {
      method: 'POST',
      body: JSON.stringify({ password }),
    }),

  // Lyrics
  getTrackLyrics: (trackId: string) => fetchJson<LyricsData>(`/api/lyrics/${trackId}`),
  refetchTrackLyrics: (trackId: string) => fetchJson<LyricsData>(`/api/lyrics/${trackId}/refetch`, { method: 'POST' }),

  // Smart Playlists
  getSmartPlaylists: () => fetchJson<SmartPlaylistPreset[]>('/api/smart-playlists'),
  getSmartPlaylistDetail: (key: string) => fetchJson<SmartPlaylistDetail>(`/api/smart-playlists/${key}`),

  // Similar Artists
  getSimilarArtists: (artistId: string) => fetchJson<SimilarArtistsResponse>(`/api/artists/${artistId}/similar`),
  refetchSimilarArtists: (artistId: string) => fetchJson<SimilarArtistsResponse>(`/api/artists/${artistId}/similar/refetch`, { method: 'POST' }),

  // Physical Album Scans & Booklets
  getAlbumScans: (albumId: string) => fetchJson<AlbumScan[]>(`/api/tracks/albums/${albumId}/scans`),
  getAlbumScanFileUrl: (albumId: string, relPath: string) =>
    `/api/tracks/albums/${albumId}/scans/file?relPath=${encodeURIComponent(relPath)}`,

  // Library Health & Audio Quality Audit
  getLibraryAudit: () => fetchJson<LibraryAuditResult>('/api/library/audit'),

  // Library Health Center
  getLibraryHealth: (refresh = false) =>
    fetchJson<LibraryHealthOverview>(`/api/library/health/overview${refresh ? '?refresh=true' : ''}`),
  getHealthIssueDetails: (type: HealthIssueType, params: { limit?: number; offset?: number } = {}) => {
    const q = new URLSearchParams();
    if (params.limit) q.set('limit', String(params.limit));
    if (params.offset) q.set('offset', String(params.offset));
    const qs = q.toString() ? `?${q.toString()}` : '';
    return fetchJson<HealthIssueDetail>(`/api/library/health/issues/${type}${qs}`);
  },
  getIgnoredHealthIssues: () =>
    fetchJson<{ total: number; ignored: IgnoredHealthIssue[] }>('/api/library/health/ignored'),
  ignoreHealthIssue: (body: { type: HealthIssueType; signature: string; label?: string }) =>
    fetchJson<{ success: boolean; total: number }>('/api/library/health/ignore', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  unignoreHealthIssues: (body: { type?: HealthIssueType; signature?: string } = {}) =>
    fetchJson<{ success: boolean; removed: number; total: number }>('/api/library/health/unignore', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  verifyLibraryFiles: (body: { rootId?: string; limit?: number; offset?: number } = {}) =>
    fetchJson<VerifyLibraryFilesResult>('/api/library/health/verify', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  // Helpers
  getStreamUrl: (trackId: string, transcode: boolean = false) =>
    transcode ? `/api/stream/${trackId}/transcode` : `/api/stream/${trackId}`,
  getArtworkUrl: (artworkId?: string, size: 96 | 256 | 512 = 256) =>
    artworkId ? `/api/artwork/${artworkId}?size=${size}` : `/api/artwork/unknown?size=${size}`,
  getTrackArtworkUrl: (trackId: string, size: 96 | 256 | 512 = 256) =>
    `/api/artwork/track/${trackId}?size=${size}`,
};
