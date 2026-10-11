import { create } from 'zustand';
import { User, SearchField } from '../types';

export type ViewMode = 'table' | 'albumGrid';
export type LibrarySection = 'all' | 'collection' | 'albums' | 'artists' | 'genres' | 'playlists' | 'favorites' | 'history';
export type RightPanelTab = 'nowPlaying' | 'queue' | 'details';
export type ThemeName = 'blacklibrary' | 'spotify' | 'musicbee' | 'amber' | 'light';

interface UiState {
  theme: ThemeName;
  leftSidebarOpen: boolean;
  leftSidebarWidth: number;
  rightPanelOpen: boolean;
  rightPanelWidth: number;
  viewMode: ViewMode;
  activeSection: LibrarySection;
  selectedRootId: string | null;
  selectedRootName: string | null;
  selectedArtistId: string | null;
  selectedArtistName: string | null;
  selectedAlbumId: string | null;
  selectedAlbumTitle: string | null;
  selectedGenre: string | null;
  selectedPlaylistId: string | null;
  selectedPlaylistName: string | null;
  searchQuery: string;
  searchField: SearchField;
  rightPanelTab: RightPanelTab;
  sortBy: string;
  sortOrder: 'asc' | 'desc';
  albumSortBy: string;
  albumSortOrder: 'asc' | 'desc';
  columnVisibility: Record<string, boolean>;
  columnWidths: Record<string, number>;
  isSettingsOpen: boolean;
  isAuthModalOpen: boolean;
  isEqualizerOpen: boolean;
  gridCoverSize: number;
  currentUser: User | null;

  // Actions
  setTheme: (theme: ThemeName) => void;
  toggleLeftSidebar: () => void;
  closeLeftSidebar: () => void;
  setLeftSidebarWidth: (w: number) => void;
  toggleRightPanel: () => void;
  closeRightPanel: () => void;
  setRightPanelWidth: (w: number) => void;
  setViewMode: (mode: ViewMode) => void;
  setGridCoverSize: (size: number) => void;
  setActiveSection: (sec: LibrarySection) => void;
  selectCollection: (rootId: string | null, name?: string | null) => void;
  selectArtist: (artistId: string | null, name?: string | null) => void;
  selectAlbum: (albumId: string | null, title?: string | null) => void;
  selectGenre: (genre: string | null) => void;
  selectPlaylist: (playlistId: string | null, name?: string | null) => void;
  setSearchQuery: (query: string) => void;
  setSearchField: (field: SearchField) => void;
  setRightPanelTab: (tab: RightPanelTab) => void;
  setSorting: (sortBy: string, sortOrder: 'asc' | 'desc') => void;
  setAlbumSorting: (sortBy: string, sortOrder: 'asc' | 'desc') => void;
  toggleColumnVisibility: (columnId: string) => void;
  setColumnWidth: (columnId: string, width: number) => void;
  setSettingsOpen: (open: boolean) => void;
  setAuthModalOpen: (open: boolean) => void;
  setEqualizerOpen: (open: boolean) => void;
  setCurrentUser: (user: User | null) => void;
}

const UI_STORAGE_KEY = 'black_library_ui_prefs';

function applyThemeToDocument(theme: ThemeName) {
  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('data-theme', theme);
    // Also add light class for Tailwind if theme is light
    if (theme === 'light') {
      document.documentElement.classList.add('theme-light');
    } else {
      document.documentElement.classList.remove('theme-light');
    }
  }
}

function loadPersistedUi(): Partial<UiState> {
  try {
    const raw = localStorage.getItem(UI_STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function persistUi(state: UiState) {
  try {
    const payload = {
      theme: state.theme,
      leftSidebarOpen: state.leftSidebarOpen,
      leftSidebarWidth: state.leftSidebarWidth,
      rightPanelOpen: state.rightPanelOpen,
      rightPanelWidth: state.rightPanelWidth,
      viewMode: state.viewMode,
      gridCoverSize: state.gridCoverSize,
      sortBy: state.sortBy,
      sortOrder: state.sortOrder,
      albumSortBy: state.albumSortBy,
      albumSortOrder: state.albumSortOrder,
      columnVisibility: state.columnVisibility,
      columnWidths: state.columnWidths,
      searchField: state.searchField,
    };
    localStorage.setItem(UI_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // ignore
  }
}

const persisted = loadPersistedUi();
const initialTheme: ThemeName = (persisted.theme as ThemeName) ?? 'blacklibrary';
applyThemeToDocument(initialTheme);
const isInitiallyCompact = typeof window !== 'undefined' ? window.innerWidth < 1024 : false;

export const useUiStore = create<UiState>((set, get) => ({
  theme: initialTheme,
  leftSidebarOpen: isInitiallyCompact ? false : (persisted.leftSidebarOpen ?? true),
  leftSidebarWidth: persisted.leftSidebarWidth ?? 240,
  rightPanelOpen: isInitiallyCompact ? false : (persisted.rightPanelOpen ?? false),
  rightPanelWidth: persisted.rightPanelWidth ?? 340,
  viewMode: persisted.viewMode ?? 'albumGrid',
  gridCoverSize: persisted.gridCoverSize ?? 170,
  activeSection: 'all',
  selectedRootId: null,
  selectedRootName: null,
  selectedArtistId: null,
  selectedArtistName: null,
  selectedAlbumId: null,
  selectedAlbumTitle: null,
  selectedGenre: null,
  selectedPlaylistId: null,
  selectedPlaylistName: null,
  searchQuery: '',
  searchField: (persisted.searchField as SearchField) ?? 'all',
  rightPanelTab: 'nowPlaying',
  sortBy: persisted.sortBy ?? 'artistName',
  sortOrder: (persisted.sortOrder as 'asc' | 'desc') ?? 'asc',
  albumSortBy: persisted.albumSortBy ?? 'albumArtist',
  albumSortOrder: (persisted.albumSortOrder as 'asc' | 'desc') ?? 'asc',
  columnVisibility: persisted.columnVisibility ?? {
    artwork: true,
    title: true,
    artistName: true,
    albumTitle: true,
    trackNumber: true,
    year: true,
    genre: true,
    duration: true,
    codec: true,
    rating: true,
    combinedPlayCount: true,
    lastPlayed: false,
    dateAdded: false,
  },
  columnWidths: persisted.columnWidths ?? {},
  isSettingsOpen: false,
  isAuthModalOpen: false,
  isEqualizerOpen: false,
  currentUser: null,

  setTheme: (theme) => {
    applyThemeToDocument(theme);
    set({ theme });
    persistUi(get());
  },
  toggleLeftSidebar: () => {
    set(s => ({ leftSidebarOpen: !s.leftSidebarOpen }));
    persistUi(get());
  },
  closeLeftSidebar: () => {
    set({ leftSidebarOpen: false });
    persistUi(get());
  },
  setLeftSidebarWidth: (w) => {
    set({ leftSidebarWidth: Math.max(180, Math.min(450, w)) });
    persistUi(get());
  },
  toggleRightPanel: () => {
    set(s => ({ rightPanelOpen: !s.rightPanelOpen }));
    persistUi(get());
  },
  closeRightPanel: () => {
    set({ rightPanelOpen: false });
    persistUi(get());
  },
  setRightPanelWidth: (w) => {
    set({ rightPanelWidth: Math.max(260, Math.min(600, w)) });
    persistUi(get());
  },
  setViewMode: (mode) => {
    set({ viewMode: mode });
    persistUi(get());
  },
  setGridCoverSize: (size) => {
    const clamped = Math.max(110, Math.min(320, size));
    set({ gridCoverSize: clamped });
    persistUi(get());
  },
  setActiveSection: (sec) => {
    const updates: Partial<UiState> = {
      activeSection: sec,
      selectedArtistId: null,
      selectedArtistName: null,
      selectedAlbumId: null,
      selectedAlbumTitle: null,
      selectedGenre: null,
      selectedPlaylistId: null,
      selectedPlaylistName: null,
    };

    if (sec === 'albums') {
      updates.viewMode = 'albumGrid';
      updates.selectedRootId = null;
      updates.selectedRootName = null;
    } else if (sec === 'all') {
      updates.viewMode = 'table';
      updates.selectedRootId = null;
      updates.selectedRootName = null;
    } else if (sec === 'artists') {
      updates.viewMode = 'table';
      updates.sortBy = 'artistName';
      updates.sortOrder = 'asc';
    } else if (sec === 'genres') {
      updates.viewMode = 'table';
      updates.sortBy = 'genre';
      updates.sortOrder = 'asc';
    } else if (sec === 'favorites') {
      updates.viewMode = 'table';
    } else if (sec === 'history') {
      updates.viewMode = 'table';
      updates.sortBy = 'lastPlayed';
      updates.sortOrder = 'desc';
    }

    set(updates);
    persistUi(get());
  },
  selectCollection: (rootId, name) => {
    set({
      activeSection: rootId ? 'collection' : 'all',
      selectedRootId: rootId,
      selectedRootName: name || null,
      selectedArtistId: null,
      selectedAlbumId: null,
      selectedGenre: null,
      selectedPlaylistId: null,
    });
  },
  selectArtist: (artistId, name) => {
    set({
      selectedArtistId: artistId,
      selectedArtistName: name || null,
      selectedAlbumId: null,
      selectedAlbumTitle: null,
    });
  },
  selectAlbum: (albumId, title) => {
    set({
      selectedAlbumId: albumId,
      selectedAlbumTitle: title || null,
    });
  },
  selectGenre: (genre) => {
    set({
      selectedGenre: genre,
      activeSection: 'genres',
      viewMode: 'table',
    });
  },
  selectPlaylist: (playlistId, name) => {
    set({
      selectedPlaylistId: playlistId,
      selectedPlaylistName: name || null,
      activeSection: 'playlists',
      viewMode: 'table',
    });
  },
  setSearchQuery: (query) => set({ searchQuery: query }),
  setSearchField: (searchField) => {
    set({ searchField });
    persistUi(get());
  },
  setRightPanelTab: (tab) => set({ rightPanelTab: tab }),
  setSorting: (sortBy, sortOrder) => {
    set({ sortBy, sortOrder });
    persistUi(get());
  },
  setAlbumSorting: (albumSortBy, albumSortOrder) => {
    set({ albumSortBy, albumSortOrder });
    persistUi(get());
  },
  toggleColumnVisibility: (colId) => {
    set(s => {
      const current = s.columnVisibility[colId] ?? true;
      return {
        columnVisibility: { ...s.columnVisibility, [colId]: !current },
      };
    });
    persistUi(get());
  },
  setColumnWidth: (colId, width) => {
    set(s => ({
      columnWidths: { ...s.columnWidths, [colId]: width },
    }));
    persistUi(get());
  },
  setSettingsOpen: (open) => set({ isSettingsOpen: open }),
  setAuthModalOpen: (open) => set({ isAuthModalOpen: open }),
  setEqualizerOpen: (open) => set({ isEqualizerOpen: open }),
  setCurrentUser: (user) => set({ currentUser: user }),
}));
