import React, { useEffect } from 'react';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { useUiStore } from './store/uiStore';
import { usePlayerStore } from './store/playerStore';
import { api } from './api/client';

import { TopToolbar } from './components/TopToolbar';
import { LeftSidebar } from './components/LeftSidebar';
import { TrackTable } from './components/TrackTable';
import { AlbumGrid } from './components/AlbumGrid';
import { RightPanel } from './components/RightPanel';
import { PlayerBar } from './components/PlayerBar';
import { SettingsModal } from './components/SettingsModal';
import { AuthModal } from './components/AuthModal';
import { EqualizerModal } from './components/EqualizerModal';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60,
      retry: 1,
    },
  },
});

const MainLayout: React.FC = () => {
  const {
    viewMode,
    activeSection,
    selectedRootId,
    selectedArtistId,
    selectedAlbumId,
    selectedGenre,
    selectedPlaylistId,
    searchQuery,
    searchField,
    sortBy,
    sortOrder,
    selectCollection,
    setCurrentUser,
    setAuthModalOpen,
  } = useUiStore();

  const { togglePlay, previous, next, seek, setVolume, volume, isMuted, toggleMute, currentTime } = usePlayerStore();

  // Query library roots for default collection selection
  const { data: roots } = useQuery({
    queryKey: ['libraryRoots'],
    queryFn: () => api.getRoots(),
  });

  const defaultRootInitialized = React.useRef(false);

  // Set Raw Black Metal library as default when the application starts
  useEffect(() => {
    if (!defaultRootInitialized.current && roots && roots.length > 0) {
      const rawRoot = roots.find(
        (r) =>
          r.name.toLowerCase().includes('raw black metal') ||
          r.path.toLowerCase().includes('raw black metal')
      );
      if (rawRoot) {
        selectCollection(rawRoot.id, rawRoot.name);
      } else if (roots[0]) {
        selectCollection(roots[0].id, roots[0].name);
      }
      defaultRootInitialized.current = true;
    }
  }, [roots, selectCollection]);

  // Check auth and setup requirements on startup
  useEffect(() => {
    api.getAuthStatus().then((status) => {
      if (status.needsSetup) {
        setAuthModalOpen(true);
      } else if (status.authenticated && status.user) {
        setCurrentUser(status.user);
      } else {
        setAuthModalOpen(true);
      }
    }).catch(console.error);
  }, [setCurrentUser, setAuthModalOpen]);

  // Global Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if typing in an input/textarea
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea') return;

      if (e.code === 'Space') {
        e.preventDefault();
        togglePlay();
      } else if (e.code === 'ArrowRight') {
        if (e.altKey) {
          next();
        } else {
          seek(currentTime + 5);
        }
      } else if (e.code === 'ArrowLeft') {
        if (e.altKey) {
          previous();
        } else {
          seek(Math.max(0, currentTime - 5));
        }
      } else if (e.code === 'ArrowUp') {
        e.preventDefault();
        setVolume(Math.min(1, volume + 0.05));
      } else if (e.code === 'ArrowDown') {
        e.preventDefault();
        setVolume(Math.max(0, volume - 0.05));
      } else if (e.key === 'm' || e.key === 'M') {
        toggleMute();
      } else if ((e.ctrlKey || e.metaKey) && (e.key === 'f' || e.key === 'F')) {
        e.preventDefault();
        const searchInput = document.querySelector('input[placeholder*="Search"]') as HTMLInputElement;
        if (searchInput) searchInput.focus();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [togglePlay, previous, next, seek, setVolume, volume, toggleMute, currentTime]);

  // Query tracks with active filters
  const { data: trackData, isLoading: tracksLoading } = useQuery({
    queryKey: [
      'tracks',
      activeSection,
      selectedRootId,
      selectedArtistId,
      selectedAlbumId,
      selectedGenre,
      selectedPlaylistId,
      searchQuery,
      searchField,
      sortBy,
      sortOrder,
    ],
    queryFn: () => {
      const params: Record<string, any> = {
        sortBy,
        sortOrder,
        search: searchQuery || undefined,
        searchField: searchField !== 'all' ? searchField : undefined,
      };

      if (activeSection === 'collection' && selectedRootId) params.rootId = selectedRootId;
      if (selectedArtistId) params.artistId = selectedArtistId;
      if (selectedAlbumId) params.albumId = selectedAlbumId;
      if (activeSection === 'genres' && selectedGenre) params.genre = selectedGenre;
      if (activeSection === 'favorites') params.favoritesOnly = 'true';
      if (activeSection === 'playlists' && selectedPlaylistId) params.playlistId = selectedPlaylistId;

      return api.getTracks(params);
    },
  });

  return (
    <div className="flex flex-col h-[100dvh] w-screen overflow-hidden bg-charcoal-950 text-zinc-200 select-none font-sans pb-[env(safe-area-inset-bottom)]">
      <TopToolbar />

      <main className="flex-1 flex overflow-hidden relative">
        <LeftSidebar />

        <div className="flex-1 flex flex-col overflow-hidden relative">
          {viewMode === 'table' ? (
            <TrackTable tracks={trackData?.tracks || []} isLoading={tracksLoading} />
          ) : (
            <AlbumGrid />
          )}
        </div>

        <RightPanel />
      </main>

      <PlayerBar />

      <SettingsModal />
      <AuthModal />
      <EqualizerModal />
    </div>
  );
};

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <MainLayout />
    </QueryClientProvider>
  );
}

export default App;
