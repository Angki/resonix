import React from 'react';
import {
  Search,
  LayoutGrid,
  List,
  RefreshCw,
  Settings as SettingsIcon,
  Radio,
  User,
  X,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Download,
  ChevronDown,
  Shuffle,
  Keyboard,
  Maximize2,
  Minimize2,
} from 'lucide-react';
import { useUiStore } from '../store/uiStore';
import { usePlayerStore } from '../store/playerStore';
import { SearchField } from '../types';
import { api } from '../api/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

export const TopToolbar: React.FC = () => {
  const {
    pwaInstallPrompt,
    isPwaInstalled,
    setPwaInstallPrompt,
    setIsPwaInstalled,
    viewMode,
    setViewMode,
    searchQuery,
    setSearchQuery,
    searchField,
    setSearchField,
    selectedRootId,
    selectedRootName,
    selectedArtistName,
    selectedAlbumTitle,
    selectedGenre,
    selectedPlaylistName,
    selectCollection,
    selectArtist,
    selectAlbum,
    selectGenre,
    selectPlaylist,
    leftSidebarOpen,
    toggleLeftSidebar,
    rightPanelOpen,
    toggleRightPanel,
    setSettingsOpen,
    setKeyboardShortcutsOpen,
    toggleCommandPalette,
    currentUser,
    setAuthModalOpen,
    isFullscreen,
    toggleFullscreen,
  } = useUiStore();

  const queryClient = useQueryClient();

  const { data: scanStatus } = useQuery({
    queryKey: ['scanStatus'],
    queryFn: () => api.getScanStatus(),
    refetchInterval: (query) => (query.state.data?.isRunning ? 1500 : 8000),
  });

  const { data: lastFmStatus } = useQuery({
    queryKey: ['lastFmStatus'],
    queryFn: () => api.getLastFmStatus(),
    retry: false,
  });

  const scanMutation = useMutation({
    mutationFn: () => api.triggerScan(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scanStatus'] });
    },
  });

  const cancelScanMutation = useMutation({
    mutationFn: () => api.cancelScan(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scanStatus'] });
    },
  });

  const hasFilter = selectedRootName || selectedArtistName || selectedAlbumTitle || selectedGenre || selectedPlaylistName;

  return (
    <header className="h-11 bg-charcoal-900/95 backdrop-blur-md border-b border-charcoal-750 px-2 sm:px-3 flex items-center justify-between select-none shrink-0 text-xs gap-1 sm:gap-2 z-20">
      {/* Left controls & Brand */}
      <div className="flex items-center space-x-1 sm:space-x-2 shrink-0">
        <button
          onClick={toggleLeftSidebar}
          title={leftSidebarOpen ? 'Sembunyikan Navigator Perpustakaan (Ctrl+B)' : 'Buka Navigator Perpustakaan (Ctrl+B)'}
          className={`p-1.5 rounded-lg border transition ${
            leftSidebarOpen
              ? 'text-zinc-100 bg-charcoal-800 border-charcoal-700 shadow-xs'
              : 'text-zinc-400 border-transparent hover:bg-charcoal-800 hover:text-zinc-200 hover:border-charcoal-750'
          }`}
        >
          {leftSidebarOpen ? <PanelLeftClose size={14} /> : <PanelLeftOpen size={14} />}
        </button>

        {/* Brand Emblem */}
        <div className="flex items-center space-x-1.5 px-2 py-1 rounded-lg bg-charcoal-850/80 border border-charcoal-750/70 shadow-xs">
          <div className="w-4 h-4 rounded bg-gradient-to-br from-crimson-600 to-crimson-800 flex items-center justify-center text-white shadow-xs">
            <Radio size={10} className="animate-pulse" />
          </div>
          <div className="flex items-center font-mono font-bold tracking-wider text-xs">
            <span className="text-cyan-400 font-black">RESON</span>
            <span className="text-zinc-200 font-bold hidden sm:inline text-[11px]">IX</span>
          </div>
        </div>

        {/* Filter Breadcrumbs (Desktop & Tablet) */}
        {hasFilter && (
          <div className="hidden md:flex items-center space-x-1 overflow-x-auto max-w-xs pl-2 border-l border-charcoal-750">
            {selectedRootName && (
              <span className="inline-flex items-center bg-charcoal-800/90 text-zinc-300 px-2 py-0.5 rounded-full text-[10.5px] border border-charcoal-700 shadow-xs">
                <span className="text-zinc-500 mr-1 font-mono">Root:</span> {selectedRootName}
                <button onClick={() => selectCollection(null)} className="ml-1 text-zinc-400 hover:text-red-400 p-0.5">
                  <X size={10} />
                </button>
              </span>
            )}
            {selectedArtistName && (
              <span className="inline-flex items-center bg-charcoal-800/90 text-zinc-300 px-2 py-0.5 rounded-full text-[10.5px] border border-charcoal-700 shadow-xs">
                <span className="text-zinc-500 mr-1 font-mono">Artist:</span> {selectedArtistName}
                <button onClick={() => selectArtist(null)} className="ml-1 text-zinc-400 hover:text-red-400 p-0.5">
                  <X size={10} />
                </button>
              </span>
            )}
            {selectedAlbumTitle && (
              <span className="inline-flex items-center bg-charcoal-800/90 text-zinc-300 px-2 py-0.5 rounded-full text-[10.5px] border border-charcoal-700 shadow-xs">
                <span className="text-zinc-500 mr-1 font-mono">Album:</span> {selectedAlbumTitle}
                <button onClick={() => selectAlbum(null)} className="ml-1 text-zinc-400 hover:text-red-400 p-0.5">
                  <X size={10} />
                </button>
              </span>
            )}
            {selectedGenre && (
              <span className="inline-flex items-center bg-charcoal-800/90 text-zinc-300 px-2 py-0.5 rounded-full text-[10.5px] border border-charcoal-700 shadow-xs">
                <span className="text-zinc-500 mr-1 font-mono">Genre:</span> {selectedGenre}
                <button onClick={() => selectGenre(null)} className="ml-1 text-zinc-400 hover:text-red-400 p-0.5">
                  <X size={10} />
                </button>
              </span>
            )}
            {selectedPlaylistName && (
              <span className="inline-flex items-center bg-charcoal-800/90 text-zinc-300 px-2 py-0.5 rounded-full text-[10.5px] border border-charcoal-700 shadow-xs">
                <span className="text-zinc-500 mr-1 font-mono">Playlist:</span> {selectedPlaylistName}
                <button onClick={() => selectPlaylist(null)} className="ml-1 text-zinc-400 hover:text-red-400 p-0.5">
                  <X size={10} />
                </button>
              </span>
            )}
          </div>
        )}
      </div>

      {/* Center Search Bar with Field Selector */}
      <div className="flex-1 min-w-[150px] max-w-md mx-1 sm:mx-3">
        <div className="flex items-center bg-charcoal-800/80 hover:bg-charcoal-800 border border-charcoal-700/80 focus-within:border-crimson-500/80 focus-within:ring-2 focus-within:ring-crimson-500/20 rounded-lg text-xs transition duration-200 overflow-hidden shadow-xs backdrop-blur-xs">
          {/* Mode Selector */}
          <div className="relative shrink-0 border-r border-charcoal-700/80 bg-charcoal-850/60 hover:bg-charcoal-750/60 transition">
            <select
              value={searchField}
              onChange={(e) => setSearchField(e.target.value as SearchField)}
              className="appearance-none bg-transparent text-zinc-300 text-[11px] font-mono pl-2.5 pr-5 py-1.5 cursor-pointer focus:outline-none select-none transition"
              title="Search mode: All fields, Song Title, Artist, or Album"
              aria-label="Search filter field"
            >
              <option value="all" className="bg-charcoal-900 text-zinc-200">All</option>
              <option value="title" className="bg-charcoal-900 text-zinc-200">Title</option>
              <option value="artist" className="bg-charcoal-900 text-zinc-200">Artist</option>
              <option value="album" className="bg-charcoal-900 text-zinc-200">Album</option>
            </select>
            <ChevronDown size={10} className="absolute right-1.5 top-2.5 text-zinc-400 pointer-events-none" />
          </div>

          {/* Search Input */}
          <div className="relative flex-1 flex items-center min-w-0">
            <Search size={13} className="ml-2.5 text-zinc-400 shrink-0 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={
                searchField === 'title'
                  ? 'Search song title... (Ctrl+F)'
                  : searchField === 'artist'
                  ? 'Search artist... (Ctrl+F)'
                  : searchField === 'album'
                  ? 'Search album... (Ctrl+F)'
                  : 'Search library... (Ctrl+F)'
              }
              className="w-full bg-transparent text-zinc-100 placeholder-zinc-500 px-2 py-1.5 text-xs focus:outline-none"
            />
            {searchQuery ? (
              <button
                onClick={() => setSearchQuery('')}
                className="mr-2 text-zinc-400 hover:text-zinc-200 transition shrink-0 p-0.5 rounded hover:bg-charcoal-700"
                title="Clear search"
              >
                <X size={12} />
              </button>
            ) : (
              <button
                type="button"
                onClick={toggleCommandPalette}
                title="Open Command Palette (Ctrl+K)"
                className="mr-2 px-1.5 py-0.5 rounded text-[9.5px] font-mono bg-charcoal-700/70 hover:bg-charcoal-650 text-zinc-400 hover:text-zinc-200 border border-charcoal-600/70 transition shrink-0"
              >
                Ctrl+K
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Right Controls */}
      <div className="flex items-center space-x-1 sm:space-x-1.5 shrink-0">
        {/* Segmented View Toggle */}
        <div className="flex items-center bg-charcoal-850/80 border border-charcoal-750/80 rounded-lg p-0.5 shadow-xs">
          <button
            onClick={() => setViewMode('table')}
            title="Track Table View"
            className={`p-1.5 rounded-md transition ${viewMode === 'table' ? 'bg-charcoal-750 text-zinc-100 shadow-xs' : 'text-zinc-400 hover:text-zinc-200'}`}
          >
            <List size={13} />
          </button>
          <button
            onClick={() => setViewMode('albumGrid')}
            title="Album Grid View"
            className={`p-1.5 rounded-md transition ${viewMode === 'albumGrid' ? 'bg-charcoal-750 text-zinc-100 shadow-xs' : 'text-zinc-400 hover:text-zinc-200'}`}
          >
            <LayoutGrid size={13} />
          </button>
        </div>

        {/* Quick Actions (Shuffle & Rescan) */}
        <div className="hidden sm:flex items-center bg-charcoal-850/80 border border-charcoal-750/80 rounded-lg p-0.5 shadow-xs space-x-0.5">
          <button
            onClick={() => {
              api.getTracks({
                rootId: selectedRootId || undefined,
                sortBy: 'random',
                limit: 250,
              }).then((res) => {
                if (res.tracks.length > 0) {
                  usePlayerStore.getState().playTrack(res.tracks[0], res.tracks);
                  usePlayerStore.setState({ isShuffle: true });
                }
              }).catch((err) => console.error('Failed to shuffle library:', err));
            }}
            title={selectedRootName ? `Shuffle ${selectedRootName}` : 'Shuffle All'}
            className="flex items-center space-x-1 hover:bg-charcoal-750 text-zinc-300 hover:text-zinc-100 px-2 py-1 rounded-md transition cursor-pointer text-[11px]"
          >
            <Shuffle size={11} className="text-crimson-400" />
            <span className="hidden md:inline font-medium">Shuffle</span>
          </button>

          <div className="w-[1px] h-3.5 bg-charcoal-750 my-auto" />

          {/* Scanner status / trigger button */}
          {scanStatus?.isRunning ? (
            <div className="flex items-center space-x-1 px-2 py-1 text-crimson-400 text-[11px]">
              <RefreshCw size={11} className="animate-spin text-crimson-500" />
              <span className="font-mono text-[10px] hidden lg:inline">{scanStatus.tracksProcessed}</span>
              <button
                onClick={() => cancelScanMutation.mutate()}
                title="Cancel scan"
                className="text-zinc-500 hover:text-red-400 ml-0.5"
              >
                <X size={11} />
              </button>
            </div>
          ) : (
            <button
              onClick={() => scanMutation.mutate()}
              title="Scan Library Folders"
              className="flex items-center space-x-1 hover:bg-charcoal-750 text-zinc-300 hover:text-zinc-100 px-2 py-1 rounded-md transition text-[11px]"
            >
              <RefreshCw size={11} className="text-zinc-400" />
              <span className="hidden md:inline font-medium">Rescan</span>
            </button>
          )}
        </div>

        {/* Last.fm Status pill */}
        <button
          onClick={() => setSettingsOpen(true)}
          title={lastFmStatus?.isConnected ? `Last.fm: Connected as ${lastFmStatus.username}` : 'Last.fm: Not connected'}
          className={`hidden md:flex items-center space-x-1.5 px-2 py-1 rounded-lg border text-[11px] transition shadow-xs ${
            lastFmStatus?.isConnected
              ? 'bg-charcoal-850/80 border-charcoal-750/80 text-zinc-300 hover:border-charcoal-700'
              : 'bg-charcoal-900/60 border-charcoal-800 text-zinc-500 hover:text-zinc-400'
          }`}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${lastFmStatus?.isConnected ? 'bg-emerald-500 animate-pulse' : 'bg-zinc-600'}`} />
          <Radio size={11} className={lastFmStatus?.isConnected ? 'text-crimson-400' : 'text-zinc-500'} />
          <span className="font-mono text-[10.5px]">
            {lastFmStatus?.isConnected ? lastFmStatus.username : 'Last.fm'}
          </span>
        </button>

        {/* PWA Install Button */}
        {pwaInstallPrompt && !isPwaInstalled && (
          <button
            onClick={async () => {
              try {
                await pwaInstallPrompt.prompt();
                const choice = await pwaInstallPrompt.userChoice;
                if (choice.outcome === 'accepted') {
                  setIsPwaInstalled(true);
                }
                setPwaInstallPrompt(null);
              } catch (e) {
                console.warn('[PWA] Prompt error', e);
              }
            }}
            title="Install Resonix Desktop App"
            className="flex items-center space-x-1.5 bg-crimson-800/90 hover:bg-crimson-700 text-white px-2.5 py-1 rounded-lg border border-crimson-600/50 text-[11px] font-medium shadow-xs transition active:scale-95"
          >
            <Download size={11} className="text-crimson-200" />
            <span className="hidden sm:inline">Install</span>
          </button>
        )}

        {/* System & Tools Cluster */}
        <div className="flex items-center bg-charcoal-850/80 border border-charcoal-750/80 rounded-lg p-0.5 shadow-xs">
          <button
            onClick={() => setKeyboardShortcutsOpen(true)}
            title="Keyboard Shortcuts (?)"
            className="p-1.5 rounded-md hover:bg-charcoal-750 text-zinc-400 hover:text-zinc-200 transition"
          >
            <Keyboard size={13} />
          </button>

          <button
            onClick={toggleFullscreen}
            title={isFullscreen ? 'Keluar Layar Penuh (F11 / F)' : 'Mode Layar Penuh (F11 / F)'}
            className={`p-1.5 rounded-md transition ${
              isFullscreen
                ? 'text-crimson-400 bg-charcoal-750'
                : 'text-zinc-400 hover:bg-charcoal-750 hover:text-zinc-200'
            }`}
          >
            {isFullscreen ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
          </button>

          <button
            onClick={() => setSettingsOpen(true)}
            title="Settings & System Status"
            className="p-1.5 rounded-md hover:bg-charcoal-750 text-zinc-400 hover:text-zinc-200 transition"
          >
            <SettingsIcon size={13} />
          </button>

          {/* User account */}
          {currentUser ? (
            <button
              onClick={() => setAuthModalOpen(true)}
              title={`Logged in as ${currentUser.username}`}
              className="p-1.5 rounded-md hover:bg-charcoal-750 text-zinc-300 transition"
            >
              <User size={13} className="text-crimson-400" />
            </button>
          ) : (
            <button
              onClick={() => setAuthModalOpen(true)}
              className="ml-1 bg-crimson-700 hover:bg-crimson-600 text-white px-2 py-0.5 rounded text-[11px] font-medium transition"
            >
              Login
            </button>
          )}
        </div>

        {/* Right Panel Toggle */}
        <button
          onClick={toggleRightPanel}
          title={rightPanelOpen ? 'Sembunyikan Panel Kanan' : 'Buka Panel Kanan'}
          className={`p-1.5 rounded-lg border transition ${
            rightPanelOpen
              ? 'text-zinc-100 bg-charcoal-800 border-charcoal-700 shadow-xs'
              : 'text-zinc-400 border-transparent hover:bg-charcoal-800 hover:text-zinc-200 hover:border-charcoal-750'
          }`}
        >
          {rightPanelOpen ? <PanelRightClose size={14} /> : <PanelRightOpen size={14} />}
        </button>
      </div>
    </header>
  );
};
