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
  SidebarClose,
  SidebarOpen,
  Palette,
  ChevronDown,
  Shuffle,
} from 'lucide-react';
import { useUiStore, ThemeName } from '../store/uiStore';
import { usePlayerStore } from '../store/playerStore';
import { SearchField } from '../types';
import { api } from '../api/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

export const TopToolbar: React.FC = () => {
  const {
    theme,
    setTheme,
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
    currentUser,
    setAuthModalOpen,
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
    <header className="h-11 bg-charcoal-900 border-b border-charcoal-750 px-2 sm:px-3 flex items-center justify-between select-none shrink-0 text-xs gap-1 sm:gap-2">
      {/* Left controls */}
      <div className="flex items-center space-x-1 sm:space-x-2 shrink-0">
        <button
          onClick={toggleLeftSidebar}
          title={leftSidebarOpen ? 'Hide Navigator' : 'Show Navigator'}
          className="p-1.5 rounded hover:bg-charcoal-750 text-zinc-400 hover:text-zinc-200 transition"
        >
          {leftSidebarOpen ? <SidebarClose size={15} /> : <SidebarOpen size={15} />}
        </button>

        <div className="flex items-center space-x-1 font-mono text-zinc-300 font-semibold tracking-wider text-xs px-1">
          <span className="text-crimson-600 font-bold">BLACK</span>
          <span className="text-zinc-400 hidden sm:inline">LIBRARY</span>
        </div>

        {/* Filter Breadcrumbs (Desktop & Tablet) */}
        {hasFilter && (
          <div className="hidden md:flex items-center space-x-1 overflow-x-auto max-w-xs pl-2 border-l border-charcoal-750">
            {selectedRootName && (
              <span className="inline-flex items-center bg-charcoal-800 text-zinc-300 px-2 py-0.5 rounded text-[11px] border border-charcoal-700">
                <span className="text-zinc-500 mr-1">Root:</span> {selectedRootName}
                <button onClick={() => selectCollection(null)} className="ml-1 text-zinc-400 hover:text-red-400">
                  <X size={11} />
                </button>
              </span>
            )}
            {selectedArtistName && (
              <span className="inline-flex items-center bg-charcoal-800 text-zinc-300 px-2 py-0.5 rounded text-[11px] border border-charcoal-700">
                <span className="text-zinc-500 mr-1">Artist:</span> {selectedArtistName}
                <button onClick={() => selectArtist(null)} className="ml-1 text-zinc-400 hover:text-red-400">
                  <X size={11} />
                </button>
              </span>
            )}
            {selectedAlbumTitle && (
              <span className="inline-flex items-center bg-charcoal-800 text-zinc-300 px-2 py-0.5 rounded text-[11px] border border-charcoal-700">
                <span className="text-zinc-500 mr-1">Album:</span> {selectedAlbumTitle}
                <button onClick={() => selectAlbum(null)} className="ml-1 text-zinc-400 hover:text-red-400">
                  <X size={11} />
                </button>
              </span>
            )}
            {selectedGenre && (
              <span className="inline-flex items-center bg-charcoal-800 text-zinc-300 px-2 py-0.5 rounded text-[11px] border border-charcoal-700">
                <span className="text-zinc-500 mr-1">Genre:</span> {selectedGenre}
                <button onClick={() => selectGenre(null)} className="ml-1 text-zinc-400 hover:text-red-400">
                  <X size={11} />
                </button>
              </span>
            )}
            {selectedPlaylistName && (
              <span className="inline-flex items-center bg-charcoal-800 text-zinc-300 px-2 py-0.5 rounded text-[11px] border border-charcoal-700">
                <span className="text-zinc-500 mr-1">Playlist:</span> {selectedPlaylistName}
                <button onClick={() => selectPlaylist(null)} className="ml-1 text-zinc-400 hover:text-red-400">
                  <X size={11} />
                </button>
              </span>
            )}
          </div>
        )}
      </div>

      {/* Center Search Bar with Field Selector */}
      <div className="flex-1 min-w-[140px] max-w-md mx-1 sm:mx-3">
        <div className="flex items-center bg-charcoal-800 border border-charcoal-700 rounded text-xs focus-within:border-crimson-800 focus-within:ring-1 focus-within:ring-crimson-900 transition overflow-hidden shadow-xs">
          {/* Mode Selector */}
          <div className="relative shrink-0 border-r border-charcoal-700 bg-charcoal-850 hover:bg-charcoal-750 transition">
            <select
              value={searchField}
              onChange={(e) => setSearchField(e.target.value as SearchField)}
              className="appearance-none bg-transparent text-zinc-300 text-[11px] font-mono pl-2 pr-5 py-1 cursor-pointer focus:outline-none select-none transition"
              title="Search mode: All fields, Song Title, Artist, or Album"
              aria-label="Search filter field"
            >
              <option value="all" className="bg-charcoal-900 text-zinc-200">All</option>
              <option value="title" className="bg-charcoal-900 text-zinc-200">Title</option>
              <option value="artist" className="bg-charcoal-900 text-zinc-200">Artist</option>
              <option value="album" className="bg-charcoal-900 text-zinc-200">Album</option>
            </select>
            <ChevronDown size={10} className="absolute right-1.5 top-2.5 text-zinc-500 pointer-events-none" />
          </div>

          {/* Search Input */}
          <div className="relative flex-1 flex items-center min-w-0">
            <Search size={13} className="ml-2 text-zinc-500 shrink-0 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={
                searchField === 'title'
                  ? 'Search by song title... (Ctrl+F)'
                  : searchField === 'artist'
                  ? 'Search by artist... (Ctrl+F)'
                  : searchField === 'album'
                  ? 'Search by album title... (Ctrl+F)'
                  : 'Search library... (Ctrl+F)'
              }
              className="w-full bg-transparent text-zinc-200 placeholder-zinc-500 px-2 py-1 text-xs focus:outline-none"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="mr-2 text-zinc-500 hover:text-zinc-300 transition shrink-0"
                title="Clear search"
              >
                <X size={13} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Right Controls */}
      <div className="flex items-center space-x-1 sm:space-x-1.5 shrink-0">
        {/* View Toggle */}
        <div className="flex items-center bg-charcoal-800 border border-charcoal-700 rounded p-0.5">
          <button
            onClick={() => setViewMode('table')}
            title="Track Table View"
            className={`p-1 rounded ${viewMode === 'table' ? 'bg-charcoal-700 text-zinc-100' : 'text-zinc-400 hover:text-zinc-200'}`}
          >
            <List size={13} />
          </button>
          <button
            onClick={() => setViewMode('albumGrid')}
            title="Album Grid View"
            className={`p-1 rounded ${viewMode === 'albumGrid' ? 'bg-charcoal-700 text-zinc-100' : 'text-zinc-400 hover:text-zinc-200'}`}
          >
            <LayoutGrid size={13} />
          </button>
        </div>

        {/* Shuffle Library / Collection button */}
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
          className="flex items-center space-x-1 bg-charcoal-800 hover:bg-charcoal-750 text-zinc-300 px-2 py-1 rounded border border-charcoal-700 transition cursor-pointer"
        >
          <Shuffle size={11} className="text-crimson-400" />
          <span className="hidden sm:inline">Shuffle</span>
        </button>

        {/* Scanner status / trigger button */}
        {scanStatus?.isRunning ? (
          <div className="flex items-center space-x-1.5 bg-charcoal-800 px-2 py-1 rounded border border-charcoal-700">
            <RefreshCw size={12} className="text-crimson-500 animate-spin" />
            <span className="text-zinc-300 font-mono text-[11px] hidden sm:inline">
              Scanning: {scanStatus.tracksProcessed}
            </span>
            <button
              onClick={() => cancelScanMutation.mutate()}
              title="Cancel scan"
              className="text-zinc-500 hover:text-red-400 ml-1"
            >
              <X size={12} />
            </button>
          </div>
        ) : (
          <button
            onClick={() => scanMutation.mutate()}
            title="Scan Library Folders"
            className="flex items-center space-x-1 bg-charcoal-800 hover:bg-charcoal-750 text-zinc-300 px-2 py-1 rounded border border-charcoal-700 transition"
          >
            <RefreshCw size={11} className="text-zinc-400" />
            <span className="hidden sm:inline">Rescan</span>
          </button>
        )}

        {/* Last.fm Status pill */}
        <button
          onClick={() => setSettingsOpen(true)}
          title={lastFmStatus?.isConnected ? `Last.fm: Connected as ${lastFmStatus.username}` : 'Last.fm: Not connected'}
          className={`hidden sm:flex items-center space-x-1 px-2 py-1 rounded border text-[11px] transition ${
            lastFmStatus?.isConnected
              ? 'bg-charcoal-800 border-charcoal-700 text-zinc-300'
              : 'bg-charcoal-850 border-charcoal-800 text-zinc-500'
          }`}
        >
          <Radio size={11} className={lastFmStatus?.isConnected ? 'text-red-500' : 'text-zinc-600'} />
          <span className="hidden md:inline font-mono">
            {lastFmStatus?.isConnected ? lastFmStatus.username : 'Last.fm'}
          </span>
        </button>

        {/* Theme / Skin Selector */}
        <div className="flex items-center space-x-1 bg-charcoal-800 border border-charcoal-700 rounded px-1.5 py-0.5 text-[11px]">
          <Palette size={12} className="text-zinc-400 shrink-0" />
          <select
            value={theme}
            onChange={(e) => setTheme(e.target.value as ThemeName)}
            title="Switch Theme / Skin"
            className="bg-transparent text-zinc-300 focus:outline-none cursor-pointer pr-0.5 text-[11px]"
          >
            <option value="blacklibrary" className="bg-charcoal-900 text-zinc-200">
              Black Library
            </option>
            <option value="spotify" className="bg-charcoal-900 text-zinc-200">
              Spotify Dark
            </option>
            <option value="musicbee" className="bg-charcoal-900 text-zinc-200">
              MusicBee Slate
            </option>
            <option value="amber" className="bg-charcoal-900 text-zinc-200">
              Dungeon Amber
            </option>
            <option value="light" className="bg-charcoal-900 text-zinc-200">
              Light Metal
            </option>
          </select>
        </div>

        {/* Settings button */}
        <button
          onClick={() => setSettingsOpen(true)}
          title="Settings & System Status"
          className="p-1.5 rounded hover:bg-charcoal-750 text-zinc-400 hover:text-zinc-200 transition"
        >
          <SettingsIcon size={14} />
        </button>

        {/* User account */}
        {currentUser ? (
          <button
            onClick={() => setAuthModalOpen(true)}
            title={`Logged in as ${currentUser.username}`}
            className="flex items-center space-x-1 p-1.5 rounded hover:bg-charcoal-750 text-zinc-300 transition"
          >
            <User size={14} className="text-crimson-500" />
          </button>
        ) : (
          <button
            onClick={() => setAuthModalOpen(true)}
            className="bg-crimson-800 hover:bg-crimson-700 text-white px-2 py-0.5 rounded text-[11px] font-medium transition"
          >
            Login
          </button>
        )}

        {/* Right Panel Toggle */}
        <button
          onClick={toggleRightPanel}
          title={rightPanelOpen ? 'Hide Now Playing & Queue' : 'Show Now Playing & Queue'}
          className={`p-1.5 rounded transition ${rightPanelOpen ? 'text-crimson-400 bg-charcoal-750' : 'text-zinc-400 hover:bg-charcoal-750'}`}
        >
          <SidebarOpen size={15} />
        </button>
      </div>
    </header>
  );
};
