import React, { useEffect } from 'react';
import { QueryClient, QueryClientProvider, useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useUiStore } from './store/uiStore';
import { api } from './api/client';
import { Track } from './types';

import { TopToolbar } from './components/TopToolbar';
import { LeftSidebar } from './components/LeftSidebar';
import { TrackTable } from './components/TrackTable';
import { AlbumGrid } from './components/AlbumGrid';
import { RightPanel } from './components/RightPanel';
import { PlayerBar } from './components/PlayerBar';
import { SettingsModal } from './components/SettingsModal';
import { AuthModal } from './components/AuthModal';
import { EqualizerModal } from './components/EqualizerModal';
import { VisualizerModal } from './components/VisualizerModal';
import { KeyboardShortcutsModal } from './components/KeyboardShortcutsModal';
import { MobileNowPlayingDrawer } from './components/MobileNowPlayingDrawer';
import { TrackPropertiesModal } from './components/TrackPropertiesModal';
import { PlayHistoryView } from './components/PlayHistoryView';
import { LibraryHealthView } from './components/LibraryHealthView';
import { ArtistGrid } from './components/ArtistGrid';
import { ArtistDetailView } from './components/ArtistDetailView';
import { SmartPlaylistView } from './components/SmartPlaylistView';
import { AmbientGlassBackground } from './components/AmbientGlassBackground';
import { PwaInstallBanner } from './components/PwaInstallBanner';
import { CommandPaletteModal } from './components/CommandPaletteModal';
import { MiniPlayerContainer } from './components/MiniPlayer';
import { useVisualizerStore } from './store/visualizerStore';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { offlineStorageService } from './services/offlineStorageService';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60,
      retry: 1,
    },
  },
});

const MainLayout: React.FC = () => {
  useKeyboardShortcuts();

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

  const [offlineTracks, setOfflineTracks] = React.useState<Track[]>(() => offlineStorageService.getOfflineTracks());

  React.useEffect(() => {
    return offlineStorageService.subscribe(() => {
      setOfflineTracks(offlineStorageService.getOfflineTracks());
    });
  }, []);

  // Query library roots for default collection selection
  const { data: roots } = useQuery({
    queryKey: ['libraryRoots'],
    queryFn: () => api.getRoots(),
  });

  const defaultRootInitialized = React.useRef(false);

  // Select the first available library root if none selected
  useEffect(() => {
    if (!defaultRootInitialized.current && roots && roots.length > 0) {
      if (!selectedRootId) {
        selectCollection(roots[0].id, roots[0].name);
      }
      defaultRootInitialized.current = true;
    }
  }, [roots, selectCollection, selectedRootId]);

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

  // Sync fullscreen state with document fullscreenchange event
  useEffect(() => {
    const handleFsChange = () => {
      useUiStore.getState().setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);


  // Query tracks with active filters. Pages are fetched lazily so huge
  // libraries don't download everything on first paint.
  const TRACKS_PAGE_SIZE = 300;
  const {
    data: trackData,
    isLoading: tracksLoading,
    isFetching: tracksFetching,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
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
    initialPageParam: 1,
    queryFn: ({ pageParam }) => {
      const params: Record<string, any> = {
        sortBy,
        sortOrder,
        search: searchQuery || undefined,
        searchField: searchField !== 'all' ? searchField : undefined,
        page: pageParam,
        limit: TRACKS_PAGE_SIZE,
      };

      if (selectedRootId && activeSection !== 'playlists') params.rootId = selectedRootId;
      if (selectedArtistId) params.artistId = selectedArtistId;
      if (selectedAlbumId) params.albumId = selectedAlbumId;
      if (activeSection === 'genres' && selectedGenre) params.genre = selectedGenre;
      if (activeSection === 'favorites') params.favoritesOnly = 'true';
      if (activeSection === 'playlists' && selectedPlaylistId) params.playlistId = selectedPlaylistId;

      return api.getTracks(params);
    },
    getNextPageParam: (lastPage, allPages) => {
      const loaded = allPages.reduce((sum, page) => sum + page.tracks.length, 0);
      return loaded < lastPage.total ? allPages.length + 1 : undefined;
    },
    placeholderData: (previousData) => previousData,
    staleTime: 1000 * 60 * 2,
  });

  const tracks = React.useMemo(
    () => trackData?.pages.flatMap((page) => page.tracks) ?? [],
    [trackData]
  );

  return (
    <div className="flex flex-col h-[100dvh] w-screen overflow-hidden bg-charcoal-950 text-zinc-200 select-none font-sans pb-[env(safe-area-inset-bottom)] relative">
      <AmbientGlassBackground />
      <TopToolbar />

      <main className="flex-1 flex overflow-hidden relative z-10">
        <LeftSidebar />

        <div className="flex-1 flex flex-col overflow-hidden relative">
          {activeSection === 'history' ? (
            <PlayHistoryView />
          ) : activeSection === 'artists' ? (
            selectedArtistId ? (
              <ArtistDetailView artistId={selectedArtistId} />
            ) : (
              <ArtistGrid />
            )
          ) : activeSection === 'smartPlaylist' ? (
            <SmartPlaylistView />
          ) : activeSection === 'health' ? (
            <LibraryHealthView />
          ) : activeSection === 'offline' ? (
            <TrackTable
              tracks={offlineTracks}
              isLoading={false}
              isFetching={false}
            />
          ) : viewMode === 'table' ? (
            <TrackTable
              tracks={tracks}
              isLoading={tracksLoading}
              isFetching={tracksFetching}
              hasMore={Boolean(hasNextPage)}
              isFetchingMore={isFetchingNextPage}
              totalCount={trackData?.pages[0]?.total}
              onLoadMore={() => {
                if (hasNextPage && !isFetchingNextPage) fetchNextPage();
              }}
            />
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
      <VisualizerModal />
      <KeyboardShortcutsModal />
      <MobileNowPlayingDrawer />
      <TrackPropertiesModal />
      <PwaInstallBanner />
      <CommandPaletteModal />
      <MiniPlayerContainer />
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
