import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Search,
  Sliders,
  Waves,
  Play,
  Pause,
  SkipForward,
  SkipBack,
  Shuffle,
  Repeat,
  Disc,
  Mic2,
  Music,
  Folder,
  Sparkles,
  Palette,
  Settings,
  HelpCircle,
  RefreshCw,
  Volume2,
  Layers,
  LayoutGrid,
  List,
  Clock,
  ListMusic,
  ShieldCheck,
  CornerDownLeft,
  X,
  Radio,
} from 'lucide-react';

import { useUiStore, ThemeName, ViewMode } from '../store/uiStore';
import { usePlayerStore } from '../store/playerStore';
import { useVisualizerStore } from '../store/visualizerStore';
import { useEqualizerStore, EQ_PRESETS } from '../store/equalizerStore';
import { api } from '../api/client';
import { Track, Album, Artist } from '../types';

type PaletteFilter = 'all' | 'commands' | 'tracks' | 'albums' | 'artists' | 'libraries' | 'equalizer' | 'themes';

interface PaletteItem {
  id: string;
  category: 'Commands' | 'Tracks' | 'Albums' | 'Artists' | 'Libraries' | 'Equalizer' | 'Themes';
  title: string;
  subtitle?: string;
  shortcut?: string;
  icon: React.ReactNode;
  action: () => void;
}

export const CommandPaletteModal: React.FC = () => {
  const {
    isCommandPaletteOpen,
    setCommandPaletteOpen,
    setTheme,
    theme,
    setViewMode,
    setActiveSection,
    selectCollection,
    selectArtist,
    selectAlbum,
    setEqualizerOpen,
    setVisualizerAmbientBg,
    setKeyboardShortcutsOpen,
    setSettingsOpen,
    toggleLeftSidebar,
    toggleRightPanel,
  } = useUiStore();

  const {
    isPlaying,
    togglePlay,
    next,
    previous,
    toggleShuffle,
    isShuffle,
    toggleRepeat,
    repeatMode,
    playTrack,
    currentTrack,
  } = usePlayerStore();

  const {
    isOpen: isVisualizerOpen,
    setOpen: setVisualizerOpen,
    mode: visualizerMode,
    setMode: setVisualizerMode,
  } = useVisualizerStore();

  const {
    applyPreset,
    activePreset,
    isNormalizerEnabled,
    toggleNormalizer,
    bandMode,
    setBandMode,
  } = useEqualizerStore();

  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<PaletteFilter>('all');
  const [selectedIndex, setSelectedIndex] = useState(0);

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Focus input when opened
  useEffect(() => {
    if (isCommandPaletteOpen) {
      setSearchQuery('');
      setSelectedIndex(0);
      setActiveFilter('all');
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isCommandPaletteOpen]);

  // Query library roots for library switcher commands
  const { data: roots } = useQuery({
    queryKey: ['libraryRoots'],
    queryFn: () => api.getRoots(),
    enabled: isCommandPaletteOpen,
  });

  // Query tracks when user types
  const { data: searchTracksData } = useQuery({
    queryKey: ['paletteTracks', searchQuery],
    queryFn: () => api.getTracks({ search: searchQuery, limit: 12 }),
    enabled: isCommandPaletteOpen && searchQuery.trim().length >= 2,
    staleTime: 1000 * 30,
  });

  // Query albums when user types
  const { data: searchAlbumsData } = useQuery({
    queryKey: ['paletteAlbums', searchQuery],
    queryFn: () => api.getAlbums({ search: searchQuery }),
    enabled: isCommandPaletteOpen && searchQuery.trim().length >= 2,
    staleTime: 1000 * 30,
  });

  // Query artists when user types
  const { data: searchArtistsData } = useQuery({
    queryKey: ['paletteArtists', searchQuery],
    queryFn: () => api.getArtistsList({ search: searchQuery, limit: 10 }),
    enabled: isCommandPaletteOpen && searchQuery.trim().length >= 2,
    staleTime: 1000 * 30,
  });

  // Built-in Static Commands
  const staticCommands = useMemo<PaletteItem[]>(() => {
    const list: PaletteItem[] = [
      // 1. Playback Commands
      {
        id: 'cmd-play-pause',
        category: 'Commands',
        title: isPlaying ? 'Pause Playback' : 'Resume Playback',
        subtitle: currentTrack ? `${currentTrack.artistName} - ${currentTrack.title}` : 'Audio Player',
        shortcut: 'Space',
        icon: isPlaying ? <Pause className="w-4 h-4 text-amber-400" /> : <Play className="w-4 h-4 text-emerald-400" />,
        action: () => togglePlay(),
      },
      {
        id: 'cmd-next-track',
        category: 'Commands',
        title: 'Next Track',
        subtitle: 'Skip to next in queue',
        shortcut: 'Ctrl + →',
        icon: <SkipForward className="w-4 h-4 text-zinc-300" />,
        action: () => next(),
      },
      {
        id: 'cmd-prev-track',
        category: 'Commands',
        title: 'Previous Track',
        subtitle: 'Return to start or previous song',
        shortcut: 'Ctrl + ←',
        icon: <SkipBack className="w-4 h-4 text-zinc-300" />,
        action: () => previous(),
      },
      {
        id: 'cmd-shuffle-toggle',
        category: 'Commands',
        title: isShuffle ? 'Turn Off Shuffle' : 'Shuffle Playback',
        subtitle: `Currently: ${isShuffle ? 'Enabled' : 'Disabled'}`,
        shortcut: 'S',
        icon: <Shuffle className={`w-4 h-4 ${isShuffle ? 'text-amber-400' : 'text-zinc-400'}`} />,
        action: () => toggleShuffle(),
      },
      {
        id: 'cmd-repeat-toggle',
        category: 'Commands',
        title: `Repeat Mode: ${repeatMode.toUpperCase()}`,
        subtitle: 'Cycle off / all / one',
        shortcut: 'R',
        icon: <Repeat className="w-4 h-4 text-zinc-300" />,
        action: () => toggleRepeat(),
      },

      // 2. Navigation & Views
      {
        id: 'nav-album-grid',
        category: 'Commands',
        title: 'View: Album Grid View',
        subtitle: 'Display collection as audiophile vinyl grid',
        shortcut: '',
        icon: <LayoutGrid className="w-4 h-4 text-red-400" />,
        action: () => {
          setViewMode('albumGrid');
          setActiveSection('albums');
        },
      },
      {
        id: 'nav-track-table',
        category: 'Commands',
        title: 'View: Track Table View',
        subtitle: 'Dense detailed audio metadata table',
        shortcut: '',
        icon: <List className="w-4 h-4 text-blue-400" />,
        action: () => {
          setViewMode('table');
        },
      },
      {
        id: 'nav-artists',
        category: 'Commands',
        title: 'View: Artists Catalog',
        subtitle: 'Browse all discographies by artist',
        shortcut: '',
        icon: <Mic2 className="w-4 h-4 text-purple-400" />,
        action: () => {
          setActiveSection('artists');
          selectArtist(null);
        },
      },
      {
        id: 'nav-history',
        category: 'Commands',
        title: 'View: Play History & Scrobble Log',
        subtitle: 'Past listens and scrobble timestamps',
        shortcut: '',
        icon: <Clock className="w-4 h-4 text-emerald-400" />,
        action: () => {
          setActiveSection('history');
        },
      },
      {
        id: 'nav-health',
        category: 'Commands',
        title: 'View: Library Health Center',
        subtitle: 'Diagnose duplicates, artwork gaps and metadata issues',
        shortcut: '',
        icon: <ShieldCheck className="w-4 h-4 text-cyan-400" />,
        action: () => {
          setActiveSection('health');
        },
      },
      {
        id: 'cmd-toggle-sidebar',
        category: 'Commands',
        title: 'Toggle Library Navigator Sidebar',
        subtitle: 'Show or hide left library tree',
        shortcut: 'Ctrl + B',
        icon: <Layers className="w-4 h-4 text-zinc-300" />,
        action: () => toggleLeftSidebar(),
      },
      {
        id: 'cmd-toggle-right-panel',
        category: 'Commands',
        title: 'Toggle Now Playing / Queue Panel',
        subtitle: 'Show or hide right sidebar',
        shortcut: '',
        icon: <ListMusic className="w-4 h-4 text-zinc-300" />,
        action: () => toggleRightPanel(),
      },

      // 3. Audio & DSP
      {
        id: 'cmd-open-equalizer',
        category: 'Equalizer',
        title: 'Open 10-Band Graphic Equalizer',
        subtitle: `Currently active preset: ${activePreset}`,
        shortcut: 'E',
        icon: <Sliders className="w-4 h-4 text-amber-400" />,
        action: () => setEqualizerOpen(true),
      },
      {
        id: 'cmd-toggle-normalizer',
        category: 'Equalizer',
        title: isNormalizerEnabled ? 'Disable Volume Normalizer' : 'Enable Dynamic Volume Normalizer',
        subtitle: 'Peak limiter & loudness compensation compressor',
        shortcut: '',
        icon: <Volume2 className={`w-4 h-4 ${isNormalizerEnabled ? 'text-amber-400' : 'text-zinc-400'}`} />,
        action: () => toggleNormalizer(),
      },
      {
        id: 'cmd-toggle-eq-bands',
        category: 'Equalizer',
        title: `Switch Equalizer to ${bandMode === '10-band' ? '5-Band Quick Mode' : '10-Band ISO Mode'}`,
        subtitle: `Currently in ${bandMode} mode`,
        shortcut: '',
        icon: <Sliders className="w-4 h-4 text-zinc-400" />,
        action: () => setBandMode(bandMode === '10-band' ? '5-band' : '10-band'),
      },

      // 4. Visualizer
      {
        id: 'cmd-toggle-visualizer',
        category: 'Commands',
        title: isVisualizerOpen ? 'Close Audio Visualizer' : 'Open Fullscreen Audio Visualizer',
        subtitle: '60fps Web Audio visualizer',
        shortcut: 'V',
        icon: <Waves className="w-4 h-4 text-cyan-400" />,
        action: () => setVisualizerOpen(!isVisualizerOpen),
      },
      {
        id: 'cmd-vis-spectrum',
        category: 'Commands',
        title: 'Visualizer: Spectrum Analyzer Bars',
        subtitle: '10-octave stereo FFT frequency bars',
        shortcut: '',
        icon: <Waves className="w-4 h-4 text-cyan-400" />,
        action: () => {
          setVisualizerMode(0);
          setVisualizerOpen(true);
        },
      },
      {
        id: 'cmd-vis-oscilloscope',
        category: 'Commands',
        title: 'Visualizer: Real-time Oscilloscope',
        subtitle: 'Direct time-domain audio waveform',
        shortcut: '',
        icon: <Waves className="w-4 h-4 text-emerald-400" />,
        action: () => {
          setVisualizerMode(1);
          setVisualizerOpen(true);
        },
      },
      {
        id: 'cmd-vis-pulse',
        category: 'Commands',
        title: 'Visualizer: Vinyl Album Art Pulse',
        subtitle: 'Spinning album art reactive to low-end bass',
        shortcut: '',
        icon: <Disc className="w-4 h-4 text-red-400" />,
        action: () => {
          setVisualizerMode(10);
          setVisualizerOpen(true);
        },
      },
      {
        id: 'cmd-vis-lyrics',
        category: 'Commands',
        title: 'Visualizer: Live Synced Lyrics Studio',
        subtitle: 'Full-screen synchronized lyrics karaoke display',
        shortcut: '',
        icon: <Sparkles className="w-4 h-4 text-amber-400" />,
        action: () => {
          setVisualizerMode(11);
          setVisualizerOpen(true);
        },
      },

      // 5. System & Tools
      {
        id: 'cmd-settings',
        category: 'Commands',
        title: 'Open Settings & Server Integrations',
        subtitle: 'Subsonic API, Last.fm, External Playlists, Audio roots',
        shortcut: 'Ctrl + ,',
        icon: <Settings className="w-4 h-4 text-zinc-300" />,
        action: () => setSettingsOpen(true),
      },
      {
        id: 'cmd-shortcuts',
        category: 'Commands',
        title: 'Keyboard Shortcuts Cheatsheet',
        subtitle: 'View all keyboard control mappings',
        shortcut: '?',
        icon: <HelpCircle className="w-4 h-4 text-zinc-300" />,
        action: () => setKeyboardShortcutsOpen(true),
      },
      {
        id: 'cmd-rescan',
        category: 'Commands',
        title: 'Trigger Music Library Scan',
        subtitle: 'Scan configured folders for new tracks',
        shortcut: '',
        icon: <RefreshCw className="w-4 h-4 text-emerald-400" />,
        action: () => {
          api.triggerScan().catch(console.error);
        },
      },
    ];

    // Add EQ Presets
    for (const preset of EQ_PRESETS) {
      list.push({
        id: `eq-preset-${preset.name}`,
        category: 'Equalizer',
        title: `EQ Preset: ${preset.name}`,
        subtitle: `${preset.category} — ${preset.description}`,
        shortcut: '',
        icon: <Sliders className={`w-4 h-4 ${activePreset === preset.name ? 'text-amber-400' : 'text-zinc-500'}`} />,
        action: () => {
          applyPreset(preset.name);
        },
      });
    }

    // Add Themes
    const themesList: Array<{ name: ThemeName; label: string; desc: string }> = [
      { name: 'resonance', label: 'Resonance Harmonic (Electric Cyan & Violet)', desc: 'Acoustic deep obsidian with resonant cyan & violet harmonic frequencies' },
      { name: 'blacklibrary', label: 'Resonix Crimson (Signature Dark)', desc: 'Pure charcoal with blood crimson accents' },
      { name: 'spotify', label: 'Spotify Dark', desc: 'Deep obsidian with vibrant emerald green' },
      { name: 'musicbee', label: 'Cobalt Slate Dark', desc: 'Audiophile steel grey with cobalt blue' },
      { name: 'amber', label: 'Amber Vintage Tape', desc: 'Analog reel-to-reel warmth and gold meters' },
      { name: 'glass', label: 'Liquid Glass', desc: 'Vibrant blur and frosted translucent surfaces' },
      { name: 'metro-dark', label: 'Metro Minimal Dark', desc: 'High-contrast typography with flat edges' },
      { name: 'metro-light', label: 'Metro Light', desc: 'Minimal clean high-key studio theme' },
      { name: 'light', label: 'Classic Studio Light', desc: 'Light background with dark slate typography' },
    ];

    for (const t of themesList) {
      list.push({
        id: `theme-${t.name}`,
        category: 'Themes',
        title: `Theme: ${t.label}`,
        subtitle: t.desc,
        shortcut: '',
        icon: <Palette className={`w-4 h-4 ${theme === t.name ? 'text-amber-400' : 'text-zinc-400'}`} />,
        action: () => setTheme(t.name),
      });
    }

    // Add Library Root Switchers
    if (roots && roots.length > 0) {
      for (const root of roots) {
        list.push({
          id: `lib-root-${root.id}`,
          category: 'Libraries',
          title: `Switch Library: ${root.name}`,
          subtitle: `${root.trackCount.toLocaleString()} tracks — ${root.path}`,
          shortcut: '',
          icon: <Folder className="w-4 h-4 text-amber-500" />,
          action: () => {
            selectCollection(root.id, root.name);
          },
        });
      }
    }

    return list;
  }, [
    isPlaying,
    currentTrack,
    isShuffle,
    repeatMode,
    isVisualizerOpen,
    activePreset,
    isNormalizerEnabled,
    bandMode,
    theme,
    roots,
    togglePlay,
    next,
    previous,
    toggleShuffle,
    toggleRepeat,
    setViewMode,
    setActiveSection,
    selectArtist,
    toggleLeftSidebar,
    toggleRightPanel,
    setEqualizerOpen,
    toggleNormalizer,
    setBandMode,
    setVisualizerOpen,
    setVisualizerMode,
    setSettingsOpen,
    setKeyboardShortcutsOpen,
    applyPreset,
    setTheme,
    selectCollection,
  ]);

  // Combine static commands and dynamic search items
  const allItems = useMemo<PaletteItem[]>(() => {
    const items: PaletteItem[] = [...staticCommands];

    // Add matching tracks
    if (searchTracksData?.tracks && searchTracksData.tracks.length > 0) {
      for (const track of searchTracksData.tracks) {
        items.push({
          id: `track-${track.id}`,
          category: 'Tracks',
          title: track.title,
          subtitle: `${track.artistName} • ${track.albumTitle} (${Math.floor(track.duration / 60)}:${String(Math.floor(track.duration % 60)).padStart(2, '0')})`,
          shortcut: 'Play',
          icon: <Music className="w-4 h-4 text-emerald-400" />,
          action: () => {
            playTrack(track);
          },
        });
      }
    }

    // Add matching albums
    if (searchAlbumsData && searchAlbumsData.length > 0) {
      for (const album of searchAlbumsData.slice(0, 8)) {
        items.push({
          id: `album-${album.id}`,
          category: 'Albums',
          title: album.title,
          subtitle: `${album.artistName || 'Unknown Artist'}${album.year ? ` (${album.year})` : ''}`,
          shortcut: 'View',
          icon: <Disc className="w-4 h-4 text-red-400" />,
          action: () => {
            selectAlbum(album.id, album.title);
            setViewMode('albumGrid');
          },
        });
      }
    }

    // Add matching artists
    if (searchArtistsData && searchArtistsData.length > 0) {
      for (const artist of searchArtistsData.slice(0, 6)) {
        items.push({
          id: `artist-${artist.id}`,
          category: 'Artists',
          title: artist.name,
          subtitle: `${artist.albumCount} albums • ${artist.trackCount} tracks`,
          shortcut: 'Open',
          icon: <Mic2 className="w-4 h-4 text-purple-400" />,
          action: () => {
            setActiveSection('artists');
            selectArtist(artist.id, artist.name);
          },
        });
      }
    }

    return items;
  }, [staticCommands, searchTracksData, searchAlbumsData, searchArtistsData, playTrack, selectAlbum, setViewMode, setActiveSection, selectArtist]);

  // Filter items by category tab & search query
  const filteredItems = useMemo(() => {
    let result = allItems;

    // Filter by tab
    if (activeFilter !== 'all') {
      const catMap: Record<PaletteFilter, string> = {
        all: '',
        commands: 'Commands',
        tracks: 'Tracks',
        albums: 'Albums',
        artists: 'Artists',
        libraries: 'Libraries',
        equalizer: 'Equalizer',
        themes: 'Themes',
      };
      const targetCategory = catMap[activeFilter];
      if (targetCategory) {
        result = result.filter(i => i.category === targetCategory);
      }
    }

    // Filter by query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(
        i =>
          i.title.toLowerCase().includes(q) ||
          (i.subtitle && i.subtitle.toLowerCase().includes(q)) ||
          i.category.toLowerCase().includes(q)
      );
    }

    return result;
  }, [allItems, activeFilter, searchQuery]);

  // Reset or clamp selectedIndex when filteredItems change
  useEffect(() => {
    setSelectedIndex(0);
  }, [searchQuery, activeFilter]);

  // Handle keyboard navigation (Arrow Up, Down, Enter, Escape)
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => (prev + 1 < filteredItems.length ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => (prev - 1 >= 0 ? prev - 1 : Math.max(0, filteredItems.length - 1)));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const item = filteredItems[selectedIndex];
      if (item) {
        item.action();
        setCommandPaletteOpen(false);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setCommandPaletteOpen(false);
    }
  };

  // Scroll active item into view
  useEffect(() => {
    if (listRef.current) {
      const activeEl = listRef.current.querySelector('[data-selected="true"]');
      if (activeEl) {
        activeEl.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [selectedIndex]);

  if (!isCommandPaletteOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-start justify-center pt-[10vh] px-4 bg-black/60 backdrop-blur-md animate-fade-in"
      onClick={() => setCommandPaletteOpen(false)}
    >
      <div
        className="w-full max-w-2xl bg-charcoal-900/95 border border-zinc-700/80 rounded-2xl shadow-2xl shadow-black/90 overflow-hidden flex flex-col max-h-[75vh] backdrop-blur-2xl ring-1 ring-white/10"
        onClick={e => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* Search Input Bar */}
        <div className="flex items-center px-4 py-3.5 border-b border-zinc-800/80 bg-charcoal-950/60 gap-3">
          <Search className="w-5 h-5 text-zinc-400 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            className="flex-1 bg-transparent text-zinc-100 placeholder-zinc-500 text-base outline-none font-medium"
            placeholder="Type a command, song, album, artist, or theme..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="p-1 text-zinc-500 hover:text-zinc-300 rounded"
              title="Clear search"
            >
              <X className="w-4 h-4" />
            </button>
          )}
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-zinc-800 text-zinc-400 border border-zinc-700">
              ESC
            </span>
          </div>
        </div>

        {/* Category Filter Pills */}
        <div className="flex items-center gap-1 px-3 py-2 border-b border-zinc-800/60 overflow-x-auto no-scrollbar bg-charcoal-950/30">
          {(
            [
              { key: 'all', label: 'All' },
              { key: 'commands', label: 'Commands' },
              { key: 'tracks', label: 'Tracks' },
              { key: 'albums', label: 'Albums' },
              { key: 'artists', label: 'Artists' },
              { key: 'libraries', label: 'Libraries' },
              { key: 'equalizer', label: 'Equalizer' },
              { key: 'themes', label: 'Themes' },
            ] as const
          ).map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveFilter(tab.key)}
              className={`px-2.5 py-1 text-xs rounded-lg font-medium transition-colors shrink-0 ${
                activeFilter === tab.key
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Results List */}
        <div ref={listRef} className="flex-1 overflow-y-auto p-2 space-y-1">
          {filteredItems.length === 0 ? (
            <div className="py-12 text-center text-zinc-500 text-sm">
              <Search className="w-8 h-8 mx-auto mb-2 opacity-30" />
              No matching commands, tracks, or albums found for &ldquo;{searchQuery}&rdquo;
            </div>
          ) : (
            filteredItems.map((item, idx) => {
              const isSelected = idx === selectedIndex;
              return (
                <div
                  key={item.id}
                  data-selected={isSelected}
                  onClick={() => {
                    item.action();
                    setCommandPaletteOpen(false);
                  }}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={`group flex items-center justify-between px-3.5 py-2.5 rounded-xl cursor-pointer transition-all duration-150 ${
                    isSelected
                      ? 'bg-red-500/15 border border-red-500/30 text-zinc-100 shadow-sm'
                      : 'text-zinc-300 hover:bg-zinc-800/40 border border-transparent'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`p-2 rounded-lg shrink-0 transition-colors ${
                        isSelected
                          ? 'bg-red-500/25 text-red-300'
                          : 'bg-zinc-800/80 text-zinc-400 group-hover:text-zinc-200'
                      }`}
                    >
                      {item.icon}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm truncate">{item.title}</span>
                        <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-zinc-800/80 text-zinc-500 border border-zinc-700/50">
                          {item.category}
                        </span>
                      </div>
                      {item.subtitle && (
                        <div className="text-xs text-zinc-400 truncate mt-0.5">{item.subtitle}</div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 ml-3">
                    {item.shortcut && (
                      <kbd className="text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-800/80 text-zinc-400 border border-zinc-700/60">
                        {item.shortcut}
                      </kbd>
                    )}
                    {isSelected && (
                      <CornerDownLeft className="w-4 h-4 text-red-400 animate-pulse" />
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer Bar */}
        <div className="flex items-center justify-between px-4 py-2 border-t border-zinc-800/80 bg-charcoal-950/60 text-xs text-zinc-500">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 rounded bg-zinc-800 border border-zinc-700 text-[10px]">↑↓</kbd> Navigate
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 rounded bg-zinc-800 border border-zinc-700 text-[10px]">↵</kbd> Select
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 rounded bg-zinc-800 border border-zinc-700 text-[10px]">ESC</kbd> Close
            </span>
          </div>
          <div className="flex items-center gap-1 text-[11px] text-zinc-400">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-ping inline-block mr-1" />
            Resonix Command Spotlight
          </div>
        </div>
      </div>
    </div>
  );
};
