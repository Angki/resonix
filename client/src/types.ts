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

export interface MusicBeeCandidate {
  category: 'library' | 'playlist' | 'smart_playlist' | 'settings' | 'artwork';
  folder: string;
  name: string;
  fullPath: string;
  sizeBytes: number;
  modifiedAt: string;
}
