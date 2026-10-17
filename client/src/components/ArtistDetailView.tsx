import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ChevronLeft,
  Play,
  Shuffle,
  RefreshCw,
  Disc,
  Clock,
  Sparkles,
  ExternalLink,
  Music,
  Users,
  Check,
  Headphones,
} from 'lucide-react';
import { LastFmIcon } from './LastFmIcon';
import { api } from '../api/client';
import { useUiStore } from '../store/uiStore';
import { usePlayerStore } from '../store/playerStore';
import { Track, ArtistAlbumItem } from '../types';

interface ArtistDetailViewProps {
  artistId: string;
}

export const ArtistDetailView: React.FC<ArtistDetailViewProps> = ({ artistId }) => {
  const { selectArtist, selectAlbum, selectedRootId, selectedRootName } = useUiStore();
  const { playTrack } = usePlayerStore();
  const queryClient = useQueryClient();

  const [isBioExpanded, setIsBioExpanded] = useState(false);
  const [syncStatus, setSyncStatus] = useState<string | null>(null);

  const { data: artist, isLoading, isError, refetch } = useQuery({
    queryKey: ['artistDetail', artistId, selectedRootId],
    queryFn: () => api.getArtistDetail(artistId, selectedRootId || undefined),
  });

  const refetchArtMutation = useMutation({
    mutationFn: () => api.fetchArtistArt(artistId, true),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['artistDetail', artistId] });
      queryClient.invalidateQueries({ queryKey: ['artistsList'] });
    },
  });

  const syncLastFmMutation = useMutation({
    mutationFn: () => api.syncArtistLastFm(artistId, selectedRootId || undefined),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['artistDetail', artistId] });
      queryClient.invalidateQueries({ queryKey: ['artistsList'] });
      queryClient.invalidateQueries({ queryKey: ['albumsList'] });
      queryClient.invalidateQueries({ queryKey: ['tracks'] });
      setSyncStatus(`Synced ${data.syncedCount} of ${data.totalTracks} tracks from Last.fm!`);
      setTimeout(() => setSyncStatus(null), 4000);
    },
    onError: (err: any) => {
      setSyncStatus(err?.message || 'Last.fm sync failed. Connect Last.fm in Settings first.');
      setTimeout(() => setSyncStatus(null), 5000);
    },
  });

  const {
    data: similarData,
    isLoading: similarLoading,
    isFetching: similarFetching,
  } = useQuery({
    queryKey: ['similarArtists', artistId],
    queryFn: () => api.getSimilarArtists(artistId),
    staleTime: 1000 * 60 * 10,
  });

  const refetchSimilarMutation = useMutation({
    mutationFn: () => api.refetchSimilarArtists(artistId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['similarArtists', artistId] });
    },
  });

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center h-full bg-charcoal-900 text-zinc-400 text-sm">
        <div className="animate-spin mr-2">⚙</div> Memuat detail artis...
      </div>
    );
  }

  if (isError || !artist) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center h-full bg-charcoal-900 text-zinc-400 space-y-3">
        <p className="text-red-400">Gagal memuat detail artis.</p>
        <div className="flex items-center space-x-2">
          <button
            onClick={() => refetch()}
            className="flex items-center space-x-1 px-3 py-1 bg-crimson-800 hover:bg-crimson-700 rounded text-white text-xs transition cursor-pointer"
          >
            <RefreshCw size={12} />
            <span>Coba Lagi</span>
          </button>
          <button
            onClick={() => selectArtist(null)}
            className="flex items-center space-x-1 px-3 py-1 bg-charcoal-800 hover:bg-charcoal-750 rounded border border-charcoal-700 text-zinc-300 text-xs transition cursor-pointer"
          >
            <ChevronLeft size={14} />
            <span>Kembali ke Daftar Artis</span>
          </button>
        </div>
      </div>
    );
  }

  const toTrackModel = (
    t: ArtistAlbumItem['tracks'][0],
    al: ArtistAlbumItem,
    art: { id: string; name: string }
  ): Track => ({
    id: t.id,
    title: t.title,
    artistId: art.id,
    artistName: art.name,
    albumId: al.id,
    albumTitle: al.title,
    duration: t.duration,
    trackNumber: t.trackNumber ?? undefined,
    discNumber: t.discNumber ?? undefined,
    year: t.year ?? al.year ?? undefined,
    bitrate: t.bitrate ?? undefined,
    isLossless: t.isLossless,
    rootId: '',
    collectionName: '',
    relativePath: '',
    filename: '',
    extension: '',
    fileSize: 0,
    isFavorite: false,
    localPlayCount: t.localPlayCount || 0,
    importedPlayCount: t.importedPlayCount || 0,
    combinedPlayCount: t.combinedPlayCount ?? ((t.localPlayCount || 0) + (t.importedPlayCount || 0)),
    dateAdded: '',
  });

  // Collect all tracks across albums
  const allTracks: Track[] = artist.albums.flatMap((al) =>
    al.tracks.map((t) => toTrackModel(t, al, artist))
  );

  const handlePlayAll = (shuffle = false) => {
    if (allTracks.length === 0) return;
    let queue = [...allTracks];
    if (shuffle) {
      queue.sort(() => Math.random() - 0.5);
    }
    playTrack(queue[0], queue);
  };

  const formatDuration = (sec: number) => {
    const mins = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${mins}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-charcoal-900 overflow-y-auto scrollbar-thin scrollbar-thumb-charcoal-700 select-none">
      {/* Top Navigation Bar */}
      <div className="sticky top-0 z-20 flex items-center justify-between px-5 py-2.5 bg-charcoal-900/90 backdrop-blur-md border-b border-charcoal-800">
        <div className="flex items-center space-x-2">
          <button
            onClick={() => selectArtist(null)}
            className="flex items-center space-x-1.5 text-xs text-zinc-400 hover:text-white px-2.5 py-1 rounded-md bg-charcoal-800/80 hover:bg-charcoal-750 border border-charcoal-700/60 transition cursor-pointer"
          >
            <ChevronLeft size={14} />
            <span>{selectedRootName ? `Artists (${selectedRootName})` : 'All Artists'}</span>
          </button>
          {selectedRootName && (
            <span className="text-xs font-mono font-medium text-crimson-400 bg-crimson-950/70 border border-crimson-800/80 px-2 py-0.5 rounded flex items-center space-x-1">
              <span className="text-zinc-500">Library:</span>
              <span>{selectedRootName}</span>
            </span>
          )}
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={() => syncLastFmMutation.mutate()}
            disabled={syncLastFmMutation.isPending}
            title="Sync play counts from Last.fm for all tracks by this artist"
            className="flex items-center space-x-1.5 text-xs text-zinc-300 hover:text-white px-2.5 py-1 rounded-md bg-charcoal-800/80 hover:bg-charcoal-750 border border-charcoal-700/60 transition cursor-pointer disabled:opacity-50"
          >
            {syncLastFmMutation.isPending ? (
              <RefreshCw size={12} className="animate-spin text-crimson-400" />
            ) : (
              <LastFmIcon size={12} className="text-red-500" />
            )}
            <span>{syncLastFmMutation.isPending ? 'Syncing...' : 'Sync Play Counts'}</span>
          </button>
          <button
            onClick={() => refetchArtMutation.mutate()}
            disabled={refetchArtMutation.isPending}
            title="Refetch Artwork & Bio from Discogs / Metallum"
            className="flex items-center space-x-1.5 text-xs text-zinc-300 hover:text-white px-2.5 py-1 rounded-md bg-charcoal-800/80 hover:bg-charcoal-750 border border-charcoal-700/60 transition cursor-pointer disabled:opacity-50"
          >
            <RefreshCw size={12} className={refetchArtMutation.isPending ? 'animate-spin' : ''} />
            <span>{refetchArtMutation.isPending ? 'Fetching...' : 'Refetch Art'}</span>
          </button>
        </div>
      </div>

      {/* Hero Banner with Photo & Band Logo */}
      <div className="relative w-full min-h-[260px] sm:min-h-[300px] flex items-end p-6 sm:p-8 overflow-hidden border-b border-charcoal-800/80">
        {/* Background Blurred Ambient Image */}
        <div
          className="absolute inset-0 bg-cover bg-center filter blur-xl scale-110 opacity-30 transform-gpu"
          style={{ backgroundImage: `url(${api.getArtistPhotoUrl(artist.id)})` }}
        />
        {/* Dark Gradient Vignette */}
        <div className="absolute inset-0 bg-gradient-to-t from-charcoal-900 via-charcoal-900/70 to-charcoal-900/40" />

        {/* Content Box */}
        <div className="relative z-10 flex flex-col md:flex-row md:items-end gap-6 w-full">
          {/* Avatar Photo Frame */}
          <div className="w-28 h-28 sm:w-36 sm:h-36 rounded-2xl overflow-hidden shadow-2xl border-2 border-charcoal-700/80 bg-charcoal-950 shrink-0">
            <img
              src={api.getArtistPhotoUrl(artist.id)}
              alt={artist.name}
              className="w-full h-full object-cover"
            />
          </div>

          <div className="flex-1 min-w-0">
            {/* Band Logo if available */}
            {artist.hasLogo && (
              <div className="mb-2 max-w-xs h-12 flex items-center">
                <img
                  src={api.getArtistLogoUrl(artist.id)}
                  alt={`${artist.name} logo`}
                  className="max-h-12 object-contain filter drop-shadow-md"
                />
              </div>
            )}

            <h1 className="text-2xl sm:text-4xl font-extrabold text-white tracking-tight truncate drop-shadow-md">
              {artist.name}
            </h1>

            <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-400 mt-2 font-mono">
              <span className="flex items-center space-x-1">
                <Disc size={13} className="text-crimson-400" />
                <span>{artist.albumCount} {artist.albumCount === 1 ? 'Album' : 'Albums'}</span>
              </span>
              <span>•</span>
              <span className="flex items-center space-x-1">
                <Music size={13} className="text-amber-400" />
                <span>{artist.trackCount} Tracks</span>
              </span>
              {artist.totalPlays !== undefined && (
                <>
                  <span>•</span>
                  <span className="flex items-center space-x-1 text-emerald-400" title="Total scrobbles/plays across library">
                    <Headphones size={13} />
                    <span>{artist.totalPlays.toLocaleString()} Plays</span>
                  </span>
                </>
              )}
              {artist.discogsId && (
                <>
                  <span>•</span>
                  <a
                    href={`https://www.discogs.com/artist/${artist.discogsId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-zinc-400 hover:text-zinc-200 underline flex items-center space-x-0.5"
                  >
                    <span>Discogs</span>
                    <ExternalLink size={10} />
                  </a>
                </>
              )}
            </div>

            {/* Quick Action Buttons */}
            <div className="flex flex-wrap items-center gap-3 mt-4">
              <button
                onClick={() => handlePlayAll(false)}
                className="flex items-center space-x-1.5 bg-crimson-700 hover:bg-crimson-600 text-white font-semibold text-xs px-4 py-2 rounded-lg shadow-lg hover:shadow-crimson-900/50 transition active:scale-95 cursor-pointer"
              >
                <Play size={14} className="fill-white" />
                <span>Play Discography</span>
              </button>
              <button
                onClick={() => handlePlayAll(true)}
                className="flex items-center space-x-1.5 bg-charcoal-800 hover:bg-charcoal-750 text-zinc-300 hover:text-white text-xs px-3.5 py-2 rounded-lg border border-charcoal-700 transition active:scale-95 cursor-pointer"
              >
                <Shuffle size={14} />
                <span>Shuffle</span>
              </button>
              <button
                onClick={() => syncLastFmMutation.mutate()}
                disabled={syncLastFmMutation.isPending}
                className="flex items-center space-x-1.5 bg-charcoal-800 hover:bg-charcoal-750 text-zinc-300 hover:text-white text-xs px-3.5 py-2 rounded-lg border border-charcoal-700 transition active:scale-95 cursor-pointer disabled:opacity-50"
                title="Sync play counts from Last.fm for all tracks by this artist"
              >
                {syncLastFmMutation.isPending ? (
                  <RefreshCw size={13} className="animate-spin text-crimson-400" />
                ) : (
                  <LastFmIcon size={13} className="text-red-500" />
                )}
                <span>{syncLastFmMutation.isPending ? 'Syncing Last.fm...' : 'Sync Play Counts'}</span>
              </button>
            </div>

            {/* Sync Status Banner */}
            {syncStatus && (
              <div className="mt-3 inline-flex items-center space-x-2 px-3 py-1.5 rounded-lg bg-charcoal-850/95 border border-charcoal-700 text-xs text-zinc-200 font-mono shadow-lg animate-fadeIn">
                <span className="w-2 h-2 rounded-full bg-crimson-500 animate-pulse" />
                <span>{syncStatus}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Bio Snippet if available */}
      {artist.bio && (
        <div className="mx-6 sm:mx-8 my-5 p-4 rounded-xl bg-charcoal-850/60 border border-charcoal-800/80 text-xs text-zinc-300 leading-relaxed shadow-sm">
          <div className="font-semibold text-zinc-200 mb-1 flex items-center space-x-1.5">
            <Sparkles size={12} className="text-amber-400" />
            <span>Artist Biography</span>
          </div>
          <p className={isBioExpanded ? '' : 'line-clamp-3 whitespace-pre-line'}>
            {artist.bio}
          </p>
          {artist.bio.length > 200 && (
            <button
              onClick={() => setIsBioExpanded(!isBioExpanded)}
              className="text-crimson-400 hover:text-crimson-300 text-[11px] font-medium mt-1 cursor-pointer"
            >
              {isBioExpanded ? 'Tampilkan lebih sedikit' : 'Selengkapnya...'}
            </button>
          )}
        </div>
      )}

      {/* Similar Artists Carousel */}
      <div className="mx-6 sm:mx-8 my-5">
        <div className="flex items-center justify-between border-b border-charcoal-800 pb-2 mb-3">
          <div className="flex items-center space-x-2">
            <Users size={14} className="text-crimson-400" />
            <h3 className="text-sm font-bold text-zinc-100">Similar Artists</h3>
            <span className="text-[10px] text-zinc-500 font-mono">
              ({similarData?.similar?.length || 0})
            </span>
          </div>

          <button
            onClick={() => refetchSimilarMutation.mutate()}
            disabled={refetchSimilarMutation.isPending || similarFetching}
            className="flex items-center space-x-1 text-[10px] text-zinc-400 hover:text-zinc-200 transition disabled:opacity-50 cursor-pointer"
            title="Cari ulang artis serupa"
          >
            <RefreshCw size={10} className={refetchSimilarMutation.isPending || similarFetching ? 'animate-spin text-crimson-400' : ''} />
            <span>Refetch</span>
          </button>
        </div>

        {similarLoading ? (
          <div className="flex space-x-3 overflow-x-hidden py-2 animate-pulse">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="w-32 h-36 bg-charcoal-850/60 rounded-xl shrink-0 p-3">
                <div className="w-16 h-16 rounded-full bg-charcoal-800 mx-auto mb-2"></div>
                <div className="h-3 bg-charcoal-800 rounded w-3/4 mx-auto mb-1"></div>
                <div className="h-2 bg-charcoal-800 rounded w-1/2 mx-auto"></div>
              </div>
            ))}
          </div>
        ) : similarData?.similar && similarData.similar.length > 0 ? (
          <div className="flex space-x-3 overflow-x-auto pb-3 pt-1 scrollbar-thin scrollbar-thumb-charcoal-700">
            {similarData.similar.map((sim) => {
              return (
                <div
                  key={sim.name}
                  onClick={() => {
                    if (sim.inLibrary && sim.libraryArtistId) {
                      selectArtist(sim.libraryArtistId, sim.name);
                    }
                  }}
                  className={`w-32 shrink-0 p-3 rounded-xl border transition flex flex-col items-center text-center group ${
                    sim.inLibrary
                      ? 'bg-charcoal-850/70 border-charcoal-700 hover:border-crimson-500 hover:bg-charcoal-800 cursor-pointer shadow-md'
                      : 'bg-charcoal-900/40 border-charcoal-850 opacity-75'
                  }`}
                  title={sim.inLibrary ? `Buka discography ${sim.name} (${sim.trackCount} tracks di library)` : `${sim.name} (Tidak ada di library lokal)`}
                >
                  {/* Avatar / Photo */}
                  <div className="relative w-16 h-16 rounded-full overflow-hidden bg-charcoal-800 border border-charcoal-700 mb-2 shrink-0">
                    {sim.inLibrary && sim.libraryArtistId ? (
                      <img
                        src={`/api/artists/${sim.libraryArtistId}/photo`}
                        alt={sim.name}
                        className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                        onError={(e) => {
                          if (sim.imageUrl) {
                            (e.target as HTMLImageElement).src = sim.imageUrl;
                          } else {
                            (e.target as HTMLImageElement).src = `/api/artwork/unknown`;
                          }
                        }}
                      />
                    ) : sim.imageUrl ? (
                      <img
                        src={sim.imageUrl}
                        alt={sim.name}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = `/api/artwork/unknown`;
                        }}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center font-bold text-xs text-zinc-500 bg-charcoal-850">
                        {sim.name.slice(0, 2).toUpperCase()}
                      </div>
                    )}

                    {sim.inLibrary && (
                      <div className="absolute -bottom-0.5 -right-0.5 bg-emerald-500 w-3.5 h-3.5 rounded-full border-2 border-charcoal-900 flex items-center justify-center" title="Ada di Library Anda">
                        <Check size={8} className="text-black stroke-[3]" />
                      </div>
                    )}
                  </div>

                  {/* Name */}
                  <span className={`text-xs font-medium truncate w-full ${sim.inLibrary ? 'text-zinc-100 group-hover:text-crimson-400' : 'text-zinc-400'}`}>
                    {sim.name}
                  </span>

                  {/* Badge */}
                  <div className="mt-1 flex items-center space-x-1">
                    {sim.inLibrary ? (
                      <span className="px-1.5 py-0.2 rounded text-[9px] font-mono bg-emerald-950/80 text-emerald-400 border border-emerald-800/60">
                        In Library
                      </span>
                    ) : (
                      <span className="text-[10px] text-zinc-500 font-mono">
                        {sim.matchScore}% match
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-zinc-500 text-xs py-3 text-center">
            Belum ada rekomendasi artis serupa untuk artis ini.
          </div>
        )}
      </div>

      {/* Chronological Discography */}
      <div className="px-6 sm:px-8 pb-12 space-y-6">
        <h3 className="text-base font-bold text-zinc-100 flex items-center space-x-2 border-b border-charcoal-800 pb-2">
          <span>Discography</span>
          <span className="text-xs font-normal text-zinc-500 font-mono">
            ({artist.albums.length} releases)
          </span>
        </h3>

        {artist.albums.length === 0 ? (
          <div className="text-zinc-500 text-xs py-8 text-center">
            Belum ada rilis album yang terindeks untuk artis ini.
          </div>
        ) : (
          artist.albums.map((album) => (
            <div
              key={album.id}
              className="rounded-xl border border-charcoal-800 bg-charcoal-850/40 p-4 transition shadow-sm hover:border-charcoal-750"
            >
              {/* Album Header */}
              <div className="flex items-center space-x-4 mb-3 pb-2 border-b border-charcoal-800/60">
                <div
                  onClick={() => selectAlbum(album.id, album.title)}
                  className="w-14 h-14 rounded-lg overflow-hidden bg-charcoal-950 shrink-0 border border-charcoal-700/60 shadow cursor-pointer hover:opacity-90 transition"
                >
                  <img
                    src={api.getArtworkUrl(album.artworkId || undefined, 256)}
                    alt={album.title}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                </div>

                <div className="flex-1 min-w-0">
                  <div
                    onClick={() => selectAlbum(album.id, album.title)}
                    className="font-bold text-sm text-zinc-100 hover:text-crimson-400 cursor-pointer truncate transition"
                  >
                    {album.title}
                  </div>
                  <div className="flex items-center space-x-2 text-xs text-zinc-500 font-mono mt-0.5">
                    {album.year ? <span>{album.year}</span> : null}
                    {album.year ? <span>•</span> : null}
                    <span>{album.trackCount} tracks</span>
                    {album.totalPlays !== undefined && (
                      <>
                        <span>•</span>
                        <span className="text-emerald-400 flex items-center space-x-1" title="Total plays across tracks in this album">
                          <Headphones size={11} />
                          <span>{album.totalPlays.toLocaleString()} plays</span>
                        </span>
                      </>
                    )}
                    {album.isLossless && (
                      <>
                        <span>•</span>
                        <span className="text-[10px] bg-charcoal-750 text-amber-300 border border-amber-600/30 px-1 rounded font-bold">
                          LOSSLESS
                        </span>
                      </>
                    )}
                  </div>
                </div>

                <button
                  onClick={() => {
                    if (album.tracks.length > 0) {
                      const trks = album.tracks.map((t) => toTrackModel(t, album, artist));
                      playTrack(trks[0], trks);
                    }
                  }}
                  title={`Play ${album.title}`}
                  className="w-8 h-8 rounded-full bg-charcoal-800 hover:bg-crimson-700 text-zinc-300 hover:text-white flex items-center justify-center transition cursor-pointer shrink-0"
                >
                  <Play size={13} className="fill-current translate-x-0.5" />
                </button>
              </div>

              {/* Album Track Table */}
              <div className="space-y-0.5">
                {album.tracks.map((track, idx) => (
                  <div
                    key={track.id}
                    onDoubleClick={() => {
                      const albumTracks = album.tracks.map((t) => toTrackModel(t, album, artist));
                      const currentTrack = toTrackModel(track, album, artist);
                      playTrack(currentTrack, albumTracks);
                    }}
                    className="flex items-center justify-between px-2.5 py-1.5 rounded hover:bg-charcoal-800/70 text-xs text-zinc-300 group cursor-pointer transition"
                  >
                    <div className="flex items-center space-x-3 min-w-0 pr-2">
                      <span className="w-5 text-right font-mono text-zinc-600 group-hover:text-zinc-400 text-[11px]">
                        {track.trackNumber || idx + 1}
                      </span>
                      <span className="truncate group-hover:text-white">
                        {track.title}
                      </span>
                    </div>

                    <div className="flex items-center space-x-3 shrink-0 text-zinc-500 font-mono text-[11px]">
                      {(track.combinedPlayCount ?? 0) > 0 && (
                        <span
                          className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-charcoal-800 text-emerald-400 border border-charcoal-700 flex items-center space-x-1"
                          title={`Total plays: ${track.combinedPlayCount} (Local: ${track.localPlayCount || 0}, Last.fm: ${track.importedPlayCount || 0})`}
                        >
                          <Headphones size={10} />
                          <span>{track.combinedPlayCount}</span>
                        </span>
                      )}
                      {track.bitrate && (
                        <span className="hidden sm:inline text-zinc-600 text-[10px]">
                          {track.bitrate}k
                        </span>
                      )}
                      <span>{formatDuration(track.duration)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
