import React, { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Search, Play, Disc, Music, ArrowUpDown, Sparkles, X, Folder, Headphones, RefreshCw } from 'lucide-react';
import { LastFmIcon } from './LastFmIcon';
import { api } from '../api/client';
import { useUiStore } from '../store/uiStore';
import { usePlayerStore } from '../store/playerStore';
import { ArtistListItem } from '../types';

export const ArtistGrid: React.FC = () => {
  const { selectArtist, selectedRootId, selectedRootName, selectCollection } = useUiStore();
  const { playTrack } = usePlayerStore();
  const queryClient = useQueryClient();

  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'name' | 'albumCount' | 'trackCount' | 'totalPlays'>('name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatusMsg, setSyncStatusMsg] = useState<string | null>(null);

  const { data: artists = [], isLoading, isError, refetch } = useQuery({
    queryKey: ['artistsList', selectedRootId, sortBy, sortOrder],
    queryFn: () => api.getArtistsList({ rootId: selectedRootId || undefined, sortBy, order: sortOrder }),
    staleTime: 60000,
  });

  const handleSyncLastFm = async () => {
    if (isSyncing) return;
    try {
      setIsSyncing(true);
      setSyncStatusMsg('Syncing play counts from Last.fm...');
      const res = await api.syncLibraryLastFm(1000);
      await queryClient.invalidateQueries({ queryKey: ['artistsList'] });
      await queryClient.invalidateQueries({ queryKey: ['artistDetail'] });
      await queryClient.invalidateQueries({ queryKey: ['albumsList'] });
      await queryClient.invalidateQueries({ queryKey: ['tracks'] });
      setSyncStatusMsg(`Successfully matched ${res.matchedTracks} tracks and updated ${res.updatedTracks} play counts from Last.fm!`);
      setTimeout(() => setSyncStatusMsg(null), 4500);
    } catch (err: any) {
      setSyncStatusMsg(err.message || 'Sync failed. Connect Last.fm in Settings first.');
      setTimeout(() => setSyncStatusMsg(null), 5000);
    } finally {
      setIsSyncing(false);
    }
  };

  const filteredArtists = useMemo(() => {
    if (!searchQuery.trim()) return artists;
    const q = searchQuery.toLowerCase().trim();
    return artists.filter(a => a.name.toLowerCase().includes(q));
  }, [artists, searchQuery]);

  const handlePlayArtist = async (e: React.MouseEvent, artist: ArtistListItem) => {
    e.stopPropagation();
    try {
      const res = await api.getTracks({
        artistId: artist.id,
        rootId: selectedRootId || undefined,
        limit: 100,
      });
      if (res.tracks.length > 0) {
        playTrack(res.tracks[0], res.tracks);
      }
    } catch (err) {
      console.error('Failed to play artist tracks:', err);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-charcoal-900 overflow-hidden select-none">
      {/* Top Bar / Header Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 border-b border-charcoal-800 bg-charcoal-900/80 backdrop-blur-md">
        <div className="flex items-center space-x-3">
          <h2 className="text-lg font-bold tracking-wide text-zinc-100 flex items-center space-x-2">
            <span>Artists</span>
            {selectedRootName && (
              <span className="text-xs font-mono font-medium text-crimson-400 bg-crimson-950/70 border border-crimson-800/80 px-2 py-0.5 rounded flex items-center space-x-1.5 shadow-xs">
                <Folder size={11} className="text-crimson-400" />
                <span>{selectedRootName}</span>
                <button
                  onClick={() => selectCollection(null)}
                  title="Show artists from all collections"
                  className="hover:text-white transition cursor-pointer ml-0.5"
                >
                  <X size={11} />
                </button>
              </span>
            )}
            <span className="text-xs font-mono font-normal text-zinc-500 bg-charcoal-800 border border-charcoal-700 px-2 py-0.5 rounded-full">
              {filteredArtists.length} {filteredArtists.length === 1 ? 'artist' : 'artists'}
            </span>
          </h2>
        </div>

        <div className="flex items-center flex-wrap gap-2.5">
          {/* Live Search */}
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400" />
            <input
              type="text"
              placeholder="Filter artists..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-44 sm:w-56 pl-8 pr-3 py-1 bg-charcoal-800/90 border border-charcoal-700/80 rounded-md text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-crimson-600/70 focus:ring-1 focus:ring-crimson-600/30 transition"
            />
          </div>

          {/* Sort Selector */}
          <div className="flex items-center space-x-1.5 bg-charcoal-800/90 border border-charcoal-700/80 rounded-md px-2 py-1 text-xs text-zinc-300">
            <ArrowUpDown size={12} className="text-zinc-400" />
            <select
              value={`${sortBy}-${sortOrder}`}
              onChange={(e) => {
                const [sb, so] = e.target.value.split('-') as [any, any];
                setSortBy(sb);
                setSortOrder(so);
              }}
              className="bg-transparent text-xs text-zinc-200 focus:outline-none cursor-pointer"
            >
              <option value="name-asc" className="bg-charcoal-900">Name (A-Z)</option>
              <option value="name-desc" className="bg-charcoal-900">Name (Z-A)</option>
              <option value="totalPlays-desc" className="bg-charcoal-900">Most Played</option>
              <option value="albumCount-desc" className="bg-charcoal-900">Most Albums</option>
              <option value="trackCount-desc" className="bg-charcoal-900">Most Tracks</option>
            </select>
          </div>

          {/* Sync Play Counts from Last.fm Button */}
          <button
            onClick={handleSyncLastFm}
            disabled={isSyncing}
            className="flex items-center space-x-1.5 px-3 py-1 bg-charcoal-800/90 hover:bg-charcoal-750 disabled:opacity-50 text-zinc-200 hover:text-white rounded-md border border-charcoal-700/80 text-xs font-medium transition cursor-pointer active:scale-95 shadow-xs"
            title="Sync play counts from Last.fm into library"
          >
            {isSyncing ? (
              <RefreshCw size={12} className="animate-spin text-crimson-400" />
            ) : (
              <LastFmIcon size={12} className="text-red-500" />
            )}
            <span>{isSyncing ? 'Syncing...' : 'Sync Play Counts'}</span>
          </button>
        </div>
      </div>

      {/* Sync Status Banner */}
      {syncStatusMsg && (
        <div className="px-5 py-2 bg-charcoal-850 border-b border-charcoal-800 text-xs text-zinc-200 font-mono flex items-center space-x-2 animate-fadeIn shadow-sm">
          <span className="w-2 h-2 rounded-full bg-crimson-500 animate-pulse shrink-0" />
          <span>{syncStatusMsg}</span>
        </div>
      )}

      {/* Main Grid Content */}
      <div className="flex-1 overflow-y-auto p-5 scrollbar-thin scrollbar-thumb-charcoal-700">
        {isLoading ? (
          <div className="flex items-center justify-center h-64 text-zinc-500 text-sm">
            <div className="animate-spin mr-2">⚙</div> Memuat daftar artis...
          </div>
        ) : isError ? (
          <div className="flex flex-col items-center justify-center h-64 text-red-400 text-sm space-y-3">
            <p>Gagal memuat artis. Periksa apakah server backend sudah direstart dengan build terbaru.</p>
            <button
              onClick={() => refetch()}
              className="px-3.5 py-1.5 bg-crimson-800 hover:bg-crimson-700 text-white rounded text-xs transition cursor-pointer font-medium"
            >
              Coba Muat Ulang
            </button>
          </div>
        ) : filteredArtists.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-zinc-500 space-y-2">
            <Music size={32} className="text-zinc-600" />
            <p className="text-sm">Tidak ada artis yang cocok dengan pencarian.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 gap-4">
            {filteredArtists.map((artist) => (
              <div
                key={artist.id}
                onClick={() => selectArtist(artist.id, artist.name)}
                className="group relative flex flex-col items-center p-3 rounded-xl bg-charcoal-850/40 hover:bg-charcoal-800/80 border border-charcoal-800 hover:border-charcoal-700/80 transition-all duration-200 cursor-pointer shadow-sm hover:shadow-xl hover:-translate-y-0.5"
              >
                {/* Photo / Avatar Box */}
                <div className="relative w-full aspect-square max-w-[160px] rounded-full overflow-hidden shadow-md border border-charcoal-700/50 bg-charcoal-950 flex items-center justify-center">
                  <img
                    src={api.getArtistPhotoUrl(artist.id)}
                    alt={artist.name}
                    loading="lazy"
                    className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                    onError={(e) => {
                      // Fallback handled by SVG route
                    }}
                  />

                  {/* Band Logo Floating Badge if available */}
                  {artist.hasLogo && (
                    <div className="absolute bottom-1.5 inset-x-2 h-7 bg-charcoal-950/80 backdrop-blur-sm rounded px-1.5 flex items-center justify-center border border-charcoal-700/60 shadow-sm opacity-90 group-hover:opacity-100 transition">
                      <img
                        src={api.getArtistLogoUrl(artist.id)}
                        alt={`${artist.name} logo`}
                        className="max-h-5 max-w-full object-contain filter drop-shadow"
                      />
                    </div>
                  )}

                  {/* Play Button on hover */}
                  <button
                    onClick={(e) => handlePlayArtist(e, artist)}
                    title={`Play all tracks by ${artist.name}`}
                    className="absolute inset-0 m-auto w-11 h-11 rounded-full bg-crimson-600 hover:bg-crimson-500 text-white flex items-center justify-center shadow-2xl opacity-0 group-hover:opacity-100 transition-all duration-200 scale-75 group-hover:scale-100 hover:scale-110 cursor-pointer"
                  >
                    <Play size={18} className="fill-white translate-x-0.5" />
                  </button>
                </div>

                {/* Artist Name & Stats */}
                <div className="w-full text-center mt-3 px-1">
                  <div
                    title={artist.name}
                    className="font-semibold text-xs sm:text-sm text-zinc-200 group-hover:text-white truncate transition"
                  >
                    {artist.name}
                  </div>
                  <div className="flex flex-wrap items-center justify-center gap-1.5 text-[11px] text-zinc-500 mt-1">
                    <span className="flex items-center space-x-0.5">
                      <Disc size={11} className="text-zinc-600" />
                      <span>{artist.albumCount}</span>
                    </span>
                    <span>•</span>
                    <span>{artist.trackCount} tracks</span>
                    {artist.totalPlays !== undefined && artist.totalPlays > 0 && (
                      <>
                        <span>•</span>
                        <span
                          className="text-emerald-400 font-mono flex items-center space-x-1"
                          title={`Total plays across library: ${artist.totalPlays.toLocaleString()}`}
                        >
                          <Headphones size={10} />
                          <span>{artist.totalPlays.toLocaleString()}</span>
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
