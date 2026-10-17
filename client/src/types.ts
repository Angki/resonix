export type SearchField = 'all' | 'album' | 'artist' | 'title';

export interface Track {
  id: string;
  rootId: string;
  collectionName: string;
  relativePath: string;
  filename: string;
  extension: string;
  fileSize: number;
  title: string;
  trackNumber?: number;
  discNumber?: number;
  duration: number;
  year?: number;
  genre?: string;
  codec?: string;
  bitrate?: number;
  sampleRate?: number;
  bitDepth?: number;
  channels?: number;
  isLossless: boolean;
  artistId?: string;
  artistName: string;
  albumId?: string;
  albumTitle: string;
  albumArtist?: string;
  folderArtist?: string | null;
  folderAlbum?: string | null;
  folderPath?: string | null;
  artworkId?: string;
  isFavorite: boolean;
  rating?: number | null;
  localPlayCount: number;
  importedPlayCount: number;
  combinedPlayCount: number;
  lastPlayed?: string | null;
  dateAdded: string;
}

export interface Artist {
  id: string;
  name: string;
  trackCount: number;
  albumCount: number;
}

export interface Album {
  id: string;
  title: string;
  artistId?: string;
  artistName: string;
  year?: number;
  artworkId?: string;
  trackCount: number;
  isLossless?: boolean;
  maxBitDepth?: number | null;
  maxSampleRate?: number | null;
  maxBitrate?: number | null;
  primaryCodec?: string | null;
  qualityBadge?: string;
}

export interface Playlist {
  id: string;
  name: string;
  description?: string;
  isSmart: boolean;
  trackCount: number;
  updatedAt: string;
}

export interface ScanStatus {
  isRunning: boolean;
  isCancelled: boolean;
  startedAt?: string;
  finishedAt?: string;
  currentRoot?: string;
  currentFolder?: string;
  totalFilesFound: number;
  tracksProcessed: number;
  tracksAdded: number;
  tracksUpdated: number;
  errorsCount: number;
  errorMessages: string[];
}

export interface User {
  id: string;
  username: string;
  role: string;
}

export interface ExternalPlaylistCandidate {
  category: 'library' | 'playlist' | 'smart_playlist' | 'settings' | 'artwork';
  folder: string;
  name: string;
  fullPath: string;
  sizeBytes: number;
  modifiedAt: string;
}

export type MusicBeeCandidate = ExternalPlaylistCandidate;

export interface ArtistListItem {
  id: string;
  name: string;
  trackCount: number;
  albumCount: number;
  totalPlays?: number;
  hasPhoto: boolean;
  hasLogo: boolean;
  bio?: string | null;
}

export interface ArtistAlbumItem {
  id: string;
  title: string;
  year?: number | null;
  artworkId?: string | null;
  trackCount: number;
  totalPlays?: number;
  isLossless: boolean;
  tracks: {
    id: string;
    title: string;
    trackNumber?: number | null;
    discNumber?: number | null;
    duration: number;
    bitrate?: number | null;
    isLossless: boolean;
    year?: number | null;
    localPlayCount?: number;
    importedPlayCount?: number;
    combinedPlayCount?: number;
  }[];
}

export interface ArtistDetail {
  id: string;
  name: string;
  bio?: string | null;
  discogsId?: number | null;
  metallumId?: string | null;
  trackCount: number;
  albumCount: number;
  totalPlays?: number;
  hasPhoto: boolean;
  hasLogo: boolean;
  albums: ArtistAlbumItem[];
  topTracks: {
    id: string;
    title: string;
    albumTitle: string;
    duration: number;
    importedPlayCount: number;
  }[];
}

export interface ArtistBatchStatus {
  isRunning: boolean;
  totalArtists: number;
  processedArtists: number;
  artistsWithPhoto: number;
  artistsWithLogo: number;
  currentArtistName?: string;
  lastError?: string;
}

// Lyrics Types
export interface LyricsLine {
  time: number; // in seconds
  text: string;
}

export interface LyricsData {
  trackId: string;
  title: string;
  artistName: string;
  isSynced: boolean;
  source: 'sidecar' | 'embedded' | 'lrclib' | 'none';
  plainText?: string;
  lines?: LyricsLine[];
}

// Smart Playlists Types
export type SmartPlaylistKey =
  | 'top-played'
  | 'recently-added'
  | 'lossless-vault'
  | 'epic-length'
  | 'forgotten-relics';

export interface SmartPlaylistPreset {
  key: SmartPlaylistKey;
  title: string;
  subtitle: string;
  icon: string;
  accentColor: string;
  trackCount?: number;
}

export interface SmartPlaylistDetail {
  preset: SmartPlaylistPreset;
  totalDuration: number;
  trackCount: number;
  tracks: Track[];
}

// Similar Artists Types
export interface SimilarArtistItem {
  name: string;
  matchScore: number;
  imageUrl?: string;
  inLibrary: boolean;
  libraryArtistId?: string;
  trackCount?: number;
  albumCount?: number;
}

export interface SimilarArtistsResponse {
  artistId: string;
  count: number;
  similar: SimilarArtistItem[];
}

// Physical Album Media Scans & Booklets
export interface AlbumScan {
  id: string;
  name: string;
  relPath: string;
  size: number;
  type: 'front' | 'back' | 'booklet' | 'disc' | 'inlay' | 'other';
}

// Library Health & Audio Quality Audit
export interface LibraryAuditResult {
  totals: {
    tracks: number;
    albums: number;
    artists: number;
    roots: number;
  };
  quality: {
    hiRes: number;
    cdLossless: number;
    highLossy: number;
    lowLossy: number;
    losslessPercent: number;
    codecs: Record<string, number>;
  };
  metadataHealth: {
    missingGenre: number;
    missingYear: number;
    missingArtworkAlbums: number;
    missingTrackNumber: number;
    unavailableTracks: number;
    healthScore: number;
  };
}
