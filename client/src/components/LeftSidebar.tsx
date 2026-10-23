import React, { useState, useEffect } from 'react';
import {
  Folder,
  Disc,
  Mic2,
  Tag,
  Star,
  Clock,
  ListMusic,
  Plus,
  FolderSync,
  ChevronRight,
  ChevronDown,
  Layers,
  X,
  Shuffle,
  Flame,
  Sparkles,
  ShieldCheck,
  Timer,
  Ghost,
  Download,
  Radio,
} from 'lucide-react';
import { useUiStore } from '../store/uiStore';
import { usePlayerStore } from '../store/playerStore';
import { useResponsive } from '../hooks/useResponsive';
import { api } from '../api/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { offlineStorageService } from '../services/offlineStorageService';

export const LeftSidebar: React.FC = () => {
  const {
    leftSidebarOpen,
    closeLeftSidebar,
    leftSidebarWidth,
    setLeftSidebarWidth,
    activeSection,
    setActiveSection,
    selectedRootId,
    selectedRootName,
    selectCollection,
    selectedPlaylistId,
    selectPlaylist,
    selectedSmartPlaylistKey,
    selectSmartPlaylist,
    selectArtist,
    setSettingsOpen,
  } = useUiStore();

  const { isCompact } = useResponsive();

  const handleNavClick = (callback: () => void) => {
    callback();
    if (isCompact) {
      closeLeftSidebar();
    }
  };

  const queryClient = useQueryClient();
  const [isResizing, setIsResizing] = useState(false);
  const [collectionsExpanded, setCollectionsExpanded] = useState(true);
  const [playlistsExpanded, setPlaylistsExpanded] = useState(true);
  const [smartPlaylistsExpanded, setSmartPlaylistsExpanded] = useState(true);
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [isCreatingPlaylist, setIsCreatingPlaylist] = useState(false);
  const [offlineCount, setOfflineCount] = useState(() => offlineStorageService.getOfflineCount());

  useEffect(() => {
    return offlineStorageService.subscribe(() => {
      setOfflineCount(offlineStorageService.getOfflineCount());
    });
  }, []);

  const { data: roots } = useQuery({
    queryKey: ['libraryRoots'],
    queryFn: () => api.getRoots(),
  });

  const { data: playlists } = useQuery({
    queryKey: ['playlists'],
    queryFn: () => api.getPlaylists(),
  });

  const { data: smartPlaylists } = useQuery({
    queryKey: ['smartPlaylists'],
    queryFn: () => api.getSmartPlaylists(),
  });

  const createPlaylistMutation = useMutation({
    mutationFn: (name: string) => api.createPlaylist({ name }),
    onSuccess: (newPl) => {
      queryClient.invalidateQueries({ queryKey: ['playlists'] });
      setIsCreatingPlaylist(false);
      setNewPlaylistName('');
      selectPlaylist(newPl.id, newPl.name);
    },
  });

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);

    const onMouseMove = (moveEvent: MouseEvent) => {
      setLeftSidebarWidth(moveEvent.clientX);
    };

    const onMouseUp = () => {
      setIsResizing(false);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  const handleShuffleCollection = (e: React.MouseEvent, rootId?: string) => {
    e.stopPropagation();
    api.getTracks({
      rootId,
      sortBy: 'random',
      limit: 250,
    }).then((res) => {
      if (res.tracks.length > 0) {
        usePlayerStore.getState().playTrack(res.tracks[0], res.tracks);
        usePlayerStore.setState({ isShuffle: true });
      }
    }).catch((err) => console.error('Failed to shuffle collection:', err));
  };

  if (!leftSidebarOpen) return null;

  return (
    <>
      {isCompact && (
        <div
          onClick={closeLeftSidebar}
          className="fixed inset-0 bg-black/75 backdrop-blur-xs z-40 lg:hidden"
        />
      )}
      <aside
        style={{ width: isCompact ? undefined : leftSidebarWidth }}
        className={`bg-charcoal-950 border-r border-charcoal-750 flex flex-col select-none text-xs ${
          isCompact
            ? 'fixed inset-y-0 left-0 z-50 w-72 max-w-[85vw] shadow-2xl h-full'
            : 'relative shrink-0 h-full'
        }`}
      >
        {isCompact && (
          <div className="flex items-center justify-between px-3.5 py-3 border-b border-charcoal-800 bg-charcoal-900/90 shrink-0">
            <div className="flex items-center space-x-2 font-mono text-zinc-200 font-semibold tracking-wider text-xs">
              <div className="w-5 h-5 rounded bg-crimson-700 flex items-center justify-center text-white">
                <Radio size={12} />
              </div>
              <div>
                <span className="text-cyan-400 font-black">RESON</span>
                <span className="text-zinc-200 ml-0.5 font-bold">IX</span>
              </div>
            </div>
            <button
              onClick={closeLeftSidebar}
              className="p-1.5 text-zinc-400 hover:text-zinc-100 rounded-lg hover:bg-charcoal-800 transition"
              aria-label="Close navigation"
            >
              <X size={16} />
            </button>
          </div>
        )}
        <div className="flex-1 overflow-y-auto overflow-x-hidden p-2 space-y-4">
          {/* Collections */}
          <div>
            <button
              onClick={() => setCollectionsExpanded(!collectionsExpanded)}
              className="w-full flex items-center justify-between text-zinc-400 hover:text-zinc-200 uppercase font-mono tracking-wider text-[10px] font-semibold mb-1 px-1.5 py-1"
            >
              <div className="flex items-center space-x-1">
                <Layers size={11} className="text-crimson-500" />
                <span>Collections</span>
              </div>
              {collectionsExpanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
            </button>

            {collectionsExpanded && (
              <div className="space-y-0.5">
                <div
                  onClick={() => handleNavClick(() => selectCollection(null))}
                  className={`group w-full flex items-center justify-between px-2 py-1.5 rounded transition cursor-pointer ${
                    !selectedRootId
                      ? 'bg-crimson-900/40 text-zinc-100 font-medium border-l-2 border-crimson-600'
                      : 'text-zinc-400 hover:bg-charcoal-850 hover:text-zinc-200'
                  }`}
                >
                  <div className="flex items-center space-x-2 truncate">
                    <Folder size={13} className="text-zinc-400 shrink-0" />
                    <span className="truncate">All Collections</span>
                  </div>
                  <button
                    onClick={(e) => handleShuffleCollection(e)}
                    title="Shuffle All Collections"
                    className="opacity-0 group-hover:opacity-100 p-0.5 hover:text-crimson-400 text-zinc-400 rounded transition cursor-pointer"
                  >
                    <Shuffle size={12} />
                  </button>
                </div>

                {roots?.map((root) => {
                  const isSelected = selectedRootId === root.id;
                  return (
                    <div
                      key={root.id}
                      onClick={() => handleNavClick(() => selectCollection(root.id, root.name))}
                      className={`group w-full flex items-center justify-between px-2 py-1.5 rounded transition cursor-pointer ${
                        isSelected
                          ? 'bg-crimson-900/40 text-zinc-100 font-medium border-l-2 border-crimson-600'
                          : 'text-zinc-400 hover:bg-charcoal-850 hover:text-zinc-200'
                      }`}
                    >
                      <div className="flex items-center space-x-2 truncate">
                        <Folder size={13} className="text-crimson-400/80 shrink-0" />
                        <span className="truncate">{root.name}</span>
                      </div>
                      <div className="flex items-center space-x-1.5 shrink-0">
                        <button
                          onClick={(e) => handleShuffleCollection(e, root.id)}
                          title={`Shuffle ${root.name}`}
                          className="opacity-0 group-hover:opacity-100 p-0.5 hover:text-crimson-400 text-zinc-400 rounded transition cursor-pointer"
                        >
                          <Shuffle size={12} />
                        </button>
                        <span className="font-mono text-[10px] text-zinc-600 bg-charcoal-850 px-1.5 py-0.2 rounded">
                          {root.trackCount}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
          )}
        </div>

        {/* Library Navigation */}
        <div>
          <div className="text-zinc-400 uppercase font-mono tracking-wider text-[10px] font-semibold mb-1 px-1.5 py-1">
            Library
          </div>
          <div className="space-y-0.5">
            <button
              onClick={() => handleNavClick(() => setActiveSection('all'))}
              className={`w-full flex items-center space-x-2 px-2 py-1.5 rounded transition ${
                activeSection === 'all' && !selectedRootId
                  ? 'bg-charcoal-800 text-zinc-100 font-medium'
                  : 'text-zinc-400 hover:bg-charcoal-850 hover:text-zinc-200'
              }`}
            >
              <Disc size={13} className="shrink-0" />
              <span>All Tracks</span>
            </button>

            <button
              onClick={() => handleNavClick(() => setActiveSection('albums'))}
              className={`w-full flex items-center justify-between px-2 py-1.5 rounded transition ${
                activeSection === 'albums'
                  ? 'bg-charcoal-800 text-zinc-100 font-medium'
                  : 'text-zinc-400 hover:bg-charcoal-850 hover:text-zinc-200'
              }`}
            >
              <div className="flex items-center space-x-2 truncate">
                <Disc size={13} className="shrink-0 text-zinc-400" />
                <span>Albums</span>
              </div>
              {selectedRootName && (
                <span className="text-[9.5px] font-mono text-zinc-400 bg-charcoal-850 border border-charcoal-750 px-1.5 py-0.2 rounded truncate max-w-[85px]" title={`Albums in ${selectedRootName}`}>
                  {selectedRootName}
                </span>
              )}
            </button>

            <button
              onClick={() => handleNavClick(() => {
                setActiveSection('artists');
                selectArtist(null);
              })}
              className={`w-full flex items-center justify-between px-2 py-1.5 rounded transition ${
                activeSection === 'artists'
                  ? 'bg-charcoal-800 text-zinc-100 font-medium'
                  : 'text-zinc-400 hover:bg-charcoal-850 hover:text-zinc-200'
              }`}
            >
              <div className="flex items-center space-x-2 truncate">
                <Mic2 size={13} className="shrink-0 text-zinc-400" />
                <span>Artists</span>
              </div>
              {selectedRootName && (
                <span className="text-[9.5px] font-mono text-crimson-400 bg-crimson-950/70 border border-crimson-900/60 px-1.5 py-0.2 rounded truncate max-w-[85px]" title={`Artists in ${selectedRootName}`}>
                  {selectedRootName}
                </span>
              )}
            </button>

            <button
              onClick={() => handleNavClick(() => setActiveSection('genres'))}
              className={`w-full flex items-center space-x-2 px-2 py-1.5 rounded transition ${
                activeSection === 'genres'
                  ? 'bg-charcoal-800 text-zinc-100 font-medium'
                  : 'text-zinc-400 hover:bg-charcoal-850 hover:text-zinc-200'
              }`}
            >
              <Tag size={13} className="shrink-0 text-zinc-400" />
              <span>Genres</span>
            </button>

            <button
              onClick={() => handleNavClick(() => setActiveSection('favorites'))}
              className={`w-full flex items-center space-x-2 px-2 py-1.5 rounded transition ${
                activeSection === 'favorites'
                  ? 'bg-charcoal-800 text-yellow-300 font-medium'
                  : 'text-zinc-400 hover:bg-charcoal-850 hover:text-zinc-200'
              }`}
            >
              <Star size={13} className="shrink-0 text-yellow-500 fill-yellow-500/20" />
              <span>Favorites</span>
            </button>

            <button
              onClick={() => handleNavClick(() => setActiveSection('history'))}
              className={`w-full flex items-center space-x-2 px-2 py-1.5 rounded transition ${
                activeSection === 'history'
                  ? 'bg-charcoal-800 text-zinc-100 font-medium'
                  : 'text-zinc-400 hover:bg-charcoal-850 hover:text-zinc-200'
              }`}
            >
              <Clock size={13} className="shrink-0 text-zinc-400" />
              <span>Recently Played</span>
            </button>

            <button
              onClick={() => handleNavClick(() => setActiveSection('offline'))}
              className={`w-full flex items-center justify-between px-2 py-1.5 rounded transition ${
                activeSection === 'offline'
                  ? 'bg-charcoal-800 text-emerald-300 font-medium'
                  : 'text-zinc-400 hover:bg-charcoal-850 hover:text-zinc-200'
              }`}
            >
              <div className="flex items-center space-x-2 truncate">
                <Download size={13} className="shrink-0 text-emerald-400" />
                <span>Offline / Downloaded</span>
              </div>
              {offlineCount > 0 && (
                <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950/70 border border-emerald-900/60 px-1.5 py-0.2 rounded">
                  {offlineCount}
                </span>
              )}
            </button>

            <button
              onClick={() => handleNavClick(() => setActiveSection('health'))}
              className={`w-full flex items-center space-x-2 px-2 py-1.5 rounded transition ${
                activeSection === 'health'
                  ? 'bg-charcoal-800 text-cyan-300 font-medium'
                  : 'text-zinc-400 hover:bg-charcoal-850 hover:text-zinc-200'
              }`}
            >
              <ShieldCheck size={13} className="shrink-0 text-cyan-400" />
              <span>Library Health</span>
            </button>
          </div>
        </div>

        {/* Smart Playlists */}
        <div>
          <div className="flex items-center justify-between text-zinc-400 uppercase font-mono tracking-wider text-[10px] font-semibold mb-1 px-1.5 py-1">
            <button
              onClick={() => setSmartPlaylistsExpanded(!smartPlaylistsExpanded)}
              className="flex items-center space-x-1 hover:text-zinc-200"
            >
              <Sparkles size={11} className="text-crimson-400" />
              <span>Smart Playlists</span>
              {smartPlaylistsExpanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
            </button>
          </div>

          {smartPlaylistsExpanded && (
            <div className="space-y-0.5">
              {smartPlaylists?.map((sp) => {
                const isSelected = activeSection === 'smartPlaylist' && selectedSmartPlaylistKey === sp.key;
                return (
                  <button
                    key={sp.key}
                    onClick={() => handleNavClick(() => selectSmartPlaylist(sp.key))}
                    className={`w-full flex items-center justify-between px-2 py-1.5 rounded transition ${
                      isSelected
                        ? 'bg-charcoal-800 text-zinc-100 font-medium'
                        : 'text-zinc-400 hover:bg-charcoal-850 hover:text-zinc-200'
                    }`}
                  >
                    <div className="flex items-center space-x-2 truncate">
                      {sp.icon === 'Flame' && <Flame size={13} className="shrink-0 text-amber-400" />}
                      {sp.icon === 'Sparkles' && <Sparkles size={13} className="shrink-0 text-emerald-400" />}
                      {sp.icon === 'ShieldCheck' && <ShieldCheck size={13} className="shrink-0 text-cyan-400" />}
                      {sp.icon === 'Timer' && <Timer size={13} className="shrink-0 text-purple-400" />}
                      {sp.icon === 'Ghost' && <Ghost size={13} className="shrink-0 text-zinc-400" />}
                      <span className="truncate">{sp.title}</span>
                    </div>

                    {sp.trackCount !== undefined && (
                      <span className="font-mono text-[10px] text-zinc-500 bg-charcoal-850 px-1.5 py-0.2 rounded shrink-0">
                        {sp.trackCount}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Playlists */}
        <div>
          <div className="flex items-center justify-between text-zinc-400 uppercase font-mono tracking-wider text-[10px] font-semibold mb-1 px-1.5 py-1">
            <button
              onClick={() => setPlaylistsExpanded(!playlistsExpanded)}
              className="flex items-center space-x-1 hover:text-zinc-200"
            >
              <ListMusic size={11} className="text-zinc-400" />
              <span>Playlists</span>
              {playlistsExpanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
            </button>

            <button
              onClick={() => setIsCreatingPlaylist(true)}
              title="Create new playlist"
              className="p-0.5 rounded hover:bg-charcoal-750 text-zinc-400 hover:text-zinc-200"
            >
              <Plus size={12} />
            </button>
          </div>

          {playlistsExpanded && (
            <div className="space-y-0.5">
              {isCreatingPlaylist && (
                <div className="p-1 bg-charcoal-900 border border-charcoal-700 rounded mb-1">
                  <input
                    type="text"
                    value={newPlaylistName}
                    onChange={(e) => setNewPlaylistName(e.target.value)}
                    placeholder="Playlist name..."
                    autoFocus
                    className="w-full bg-charcoal-800 text-zinc-200 px-1.5 py-0.5 rounded text-xs focus:outline-none"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && newPlaylistName.trim()) {
                        createPlaylistMutation.mutate(newPlaylistName.trim());
                      } else if (e.key === 'Escape') {
                        setIsCreatingPlaylist(false);
                      }
                    }}
                  />
                  <div className="flex justify-end space-x-1 mt-1">
                    <button
                      onClick={() => setIsCreatingPlaylist(false)}
                      className="px-1.5 py-0.5 text-[10px] text-zinc-400 hover:text-zinc-200"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => newPlaylistName.trim() && createPlaylistMutation.mutate(newPlaylistName.trim())}
                      className="px-1.5 py-0.5 text-[10px] bg-crimson-800 text-white rounded"
                    >
                      Save
                    </button>
                  </div>
                </div>
              )}

              {playlists?.map((pl) => {
                const isSelected = activeSection === 'playlists' && selectedPlaylistId === pl.id;
                return (
                  <button
                    key={pl.id}
                    onClick={() => handleNavClick(() => selectPlaylist(pl.id, pl.name))}
                    className={`w-full flex items-center justify-between px-2 py-1.5 rounded transition ${
                      isSelected
                        ? 'bg-crimson-900/40 text-zinc-100 font-medium border-l-2 border-crimson-600'
                        : 'text-zinc-400 hover:bg-charcoal-850 hover:text-zinc-200'
                    }`}
                  >
                    <div className="flex items-center space-x-2 truncate">
                      <ListMusic size={13} className="shrink-0 text-zinc-500" />
                      <span className="truncate">{pl.name}</span>
                    </div>
                    <span className="font-mono text-[10px] text-zinc-600">
                      {pl.trackCount}
                    </span>
                  </button>
                );
              })}

              {/* External playlist import trigger */}
              <button
                onClick={() => handleNavClick(() => setSettingsOpen(true))}
                className="w-full flex items-center space-x-2 px-2 py-1.5 rounded text-zinc-500 hover:bg-charcoal-850 hover:text-zinc-300 transition text-[11px]"
              >
                <FolderSync size={12} className="text-crimson-600" />
                <span>Import External Playlists...</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Resize Handle */}
      {!isCompact && (
        <div
          onMouseDown={handleMouseDown}
          className={`absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-crimson-600 transition ${
            isResizing ? 'bg-crimson-600' : 'bg-transparent'
          }`}
        />
      )}
    </aside>
  </>
  );
};
