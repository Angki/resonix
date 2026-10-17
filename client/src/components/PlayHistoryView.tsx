import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Clock,
  Play,
  Pause,
  BarChart2,
  TrendingUp,
  Headphones,
  Disc,
  Sparkles,
  Calendar,
  Layers,
  Star,
  ListPlus,
  Flame,
  Music,
} from 'lucide-react';
import { api } from '../api/client';
import { usePlayerStore } from '../store/playerStore';
import { useUiStore } from '../store/uiStore';
import { Track } from '../types';
import { ContextMenu } from './ContextMenu';

function formatDuration(sec: number): string {
  if (!sec || isNaN(sec)) return '--:--';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

function formatRelativeTime(dateStr?: string | null): string {
  if (!dateStr) return '-';
  const date = new Date(dateStr);
  const now = new Date();
  const diffSec = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diffSec < 60) return 'Just now';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  if (diffSec < 172800) return 'Yesterday';

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export const PlayHistoryView: React.FC = () => {
  const { currentTrack, isPlaying, playTrack, addToQueue, playNext } = usePlayerStore();
  const { openTrackProperties, setHighlightedAlbumId, setViewMode } = useUiStore();

  const [metricTab, setMetricTab] = useState<'minutes' | 'plays'>('minutes');
  const [hoveredPoint, setHoveredPoint] = useState<{
    x: number;
    y: number;
    label: string;
    value: number;
    count: number;
  } | null>(null);

  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; track: Track } | null>(null);

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['playbackStats'],
    queryFn: () => api.getPlaybackStats(),
    staleTime: 1000 * 60,
  });

  const { data: history, isLoading: historyLoading } = useQuery({
    queryKey: ['playbackHistory'],
    queryFn: () => api.getHistory(100),
    staleTime: 1000 * 30,
  });

  // Calculate SVG spline area chart coordinates for 14-day dailyActivity
  const chartData = useMemo(() => {
    if (!stats?.dailyActivity || stats.dailyActivity.length === 0) return null;

    const data = stats.dailyActivity;
    const values = data.map((d) => (metricTab === 'minutes' ? d.minutes : d.count));
    const maxVal = Math.max(...values, 5); // At least 5 for scale

    const width = 800;
    const height = 180;
    const paddingX = 40;
    const paddingY = 25;

    const usableWidth = width - paddingX * 2;
    const usableHeight = height - paddingY * 2;

    const points = data.map((d, i) => {
      const x = paddingX + (i / (data.length - 1)) * usableWidth;
      const y = height - paddingY - (values[i] / maxVal) * usableHeight;
      return { x, y, data: d, val: values[i] };
    });

    // Build SVG path string with smooth curves
    let pathD = `M ${points[0].x} ${points[0].y}`;
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[i];
      const p1 = points[i + 1];
      const cx = (p0.x + p1.x) / 2;
      pathD += ` C ${cx} ${p0.y}, ${cx} ${p1.y}, ${p1.x} ${p1.y}`;
    }

    const areaD = `${pathD} L ${points[points.length - 1].x} ${height - paddingY} L ${points[0].x} ${height - paddingY} Z`;

    return { points, pathD, areaD, maxVal, width, height, paddingX, paddingY };
  }, [stats?.dailyActivity, metricTab]);

  return (
    <div className="flex-1 flex flex-col h-full overflow-y-auto bg-charcoal-900 select-none p-4 sm:p-6 space-y-6">
      {/* View Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-charcoal-800">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-crimson-950/80 border border-crimson-800/60 flex items-center justify-center text-crimson-400 shadow-lg shadow-crimson-950/50">
            <TrendingUp size={20} />
          </div>
          <div>
            <h1 className="text-lg font-bold text-zinc-100 flex items-center gap-2">
              <span>Play History &amp; Listening Stats</span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-crimson-950 text-crimson-400 border border-crimson-800/60 font-normal">
                LIVE
              </span>
            </h1>
            <p className="text-xs text-zinc-400 mt-0.5">
              Comprehensive analytics, trends, and chronological listening history
            </p>
          </div>
        </div>
      </div>

      {/* Top Metric Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        {/* Card 1: Listening Time */}
        <div className="bg-charcoal-850/80 border border-charcoal-800 rounded-xl p-3.5 backdrop-blur-md relative overflow-hidden group hover:border-charcoal-700 transition">
          <div className="flex items-center justify-between text-zinc-400 mb-1">
            <span className="text-[11px] font-medium uppercase font-mono tracking-wider">Listening Time</span>
            <Clock size={14} className="text-crimson-400" />
          </div>
          <div className="flex items-baseline space-x-1.5 mt-1">
            <span className="text-xl sm:text-2xl font-bold font-mono text-zinc-100">
              {stats?.totalListeningHours ?? 0}
            </span>
            <span className="text-xs font-mono text-zinc-400">Hours</span>
          </div>
          <div className="text-[10px] text-zinc-500 mt-1 flex items-center gap-1 font-mono">
            <Flame size={10} className="text-amber-400" />
            <span>Cumulative playback</span>
          </div>
        </div>

        {/* Card 2: Total Plays */}
        <div className="bg-charcoal-850/80 border border-charcoal-800 rounded-xl p-3.5 backdrop-blur-md relative overflow-hidden group hover:border-charcoal-700 transition">
          <div className="flex items-center justify-between text-zinc-400 mb-1">
            <span className="text-[11px] font-medium uppercase font-mono tracking-wider">Tracks Played</span>
            <Headphones size={14} className="text-cyan-400" />
          </div>
          <div className="flex items-baseline space-x-1.5 mt-1">
            <span className="text-xl sm:text-2xl font-bold font-mono text-zinc-100">
              {stats?.totalPlays ?? 0}
            </span>
            <span className="text-xs font-mono text-zinc-400">plays</span>
          </div>
          <div className="text-[10px] text-zinc-500 mt-1 font-mono">
            <span>{stats?.uniqueTracks ?? 0} unique tracks</span>
          </div>
        </div>

        {/* Card 3: Lossless Fidelity */}
        <div className="bg-charcoal-850/80 border border-charcoal-800 rounded-xl p-3.5 backdrop-blur-md relative overflow-hidden group hover:border-charcoal-700 transition">
          <div className="flex items-center justify-between text-zinc-400 mb-1">
            <span className="text-[11px] font-medium uppercase font-mono tracking-wider">Lossless Ratio</span>
            <Sparkles size={14} className="text-emerald-400" />
          </div>
          <div className="flex items-baseline space-x-1.5 mt-1">
            <span className="text-xl sm:text-2xl font-bold font-mono text-emerald-400">
              {stats?.losslessPercentage ?? 0}%
            </span>
            <span className="text-xs font-mono text-zinc-400">FLAC</span>
          </div>
          <div className="text-[10px] text-zinc-500 mt-1 font-mono">
            <span>High-fidelity playback</span>
          </div>
        </div>

        {/* Card 4: Unique Artists */}
        <div className="bg-charcoal-850/80 border border-charcoal-800 rounded-xl p-3.5 backdrop-blur-md relative overflow-hidden group hover:border-charcoal-700 transition">
          <div className="flex items-center justify-between text-zinc-400 mb-1">
            <span className="text-[11px] font-medium uppercase font-mono tracking-wider">Artists Explored</span>
            <Disc size={14} className="text-purple-400" />
          </div>
          <div className="flex items-baseline space-x-1.5 mt-1">
            <span className="text-xl sm:text-2xl font-bold font-mono text-zinc-100">
              {stats?.uniqueArtists ?? 0}
            </span>
            <span className="text-xs font-mono text-zinc-400">artists</span>
          </div>
          <div className="text-[10px] text-zinc-500 mt-1 font-mono">
            <span>Across library collections</span>
          </div>
        </div>
      </div>

      {/* Daily Listening Graph Section */}
      <div className="bg-charcoal-850/90 border border-charcoal-800 rounded-xl p-4 sm:p-5 shadow-xl relative backdrop-blur-md">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
          <div className="flex items-center space-x-2">
            <BarChart2 size={16} className="text-crimson-400" />
            <h2 className="text-sm font-bold text-zinc-200">14-Day Listening Activity</h2>
          </div>

          <div className="flex items-center bg-charcoal-900 border border-charcoal-750 p-0.5 rounded-lg text-xs font-mono">
            <button
              onClick={() => setMetricTab('minutes')}
              className={`px-2.5 py-1 rounded transition ${
                metricTab === 'minutes' ? 'bg-crimson-700 text-white font-semibold' : 'text-zinc-400 hover:text-white'
              }`}
            >
              Minutes
            </button>
            <button
              onClick={() => setMetricTab('plays')}
              className={`px-2.5 py-1 rounded transition ${
                metricTab === 'plays' ? 'bg-crimson-700 text-white font-semibold' : 'text-zinc-400 hover:text-white'
              }`}
            >
              Plays
            </button>
          </div>
        </div>

        {/* SVG Spline Graph */}
        {chartData ? (
          <div className="relative w-full h-[180px] sm:h-[210px] overflow-hidden select-none">
            <svg
              viewBox={`0 0 ${chartData.width} ${chartData.height}`}
              className="w-full h-full overflow-visible"
              preserveAspectRatio="none"
            >
              <defs>
                <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#dc2626" stopOpacity="0.45" />
                  <stop offset="60%" stopColor="#dc2626" stopOpacity="0.12" />
                  <stop offset="100%" stopColor="#dc2626" stopOpacity="0.0" />
                </linearGradient>
                <linearGradient id="lineGradient" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="#ef4444" />
                  <stop offset="50%" stopColor="#f87171" />
                  <stop offset="100%" stopColor="#ef4444" />
                </linearGradient>
              </defs>

              {/* Horizontal Grid lines */}
              {[0, 0.25, 0.5, 0.75, 1].map((pct, idx) => {
                const y = chartData.height - chartData.paddingY - pct * (chartData.height - chartData.paddingY * 2);
                return (
                  <line
                    key={idx}
                    x1={chartData.paddingX}
                    y1={y}
                    x2={chartData.width - chartData.paddingX}
                    y2={y}
                    stroke="#27272a"
                    strokeDasharray="3 3"
                    strokeWidth="1"
                  />
                );
              })}

              {/* Filled Spline Area */}
              <path d={chartData.areaD} fill="url(#areaGradient)" />

              {/* Spline Stroke Line */}
              <path
                d={chartData.pathD}
                fill="none"
                stroke="url(#lineGradient)"
                strokeWidth="2.5"
                strokeLinecap="round"
              />

              {/* Interactive Data Points */}
              {chartData.points.map((pt, i) => (
                <g key={i}>
                  <circle
                    cx={pt.x}
                    cy={pt.y}
                    r={hoveredPoint?.label === pt.data.label ? '5' : '3'}
                    fill="#ffffff"
                    stroke="#dc2626"
                    strokeWidth="2"
                    className="transition-all duration-150 cursor-pointer"
                    onMouseEnter={() =>
                      setHoveredPoint({
                        x: pt.x,
                        y: pt.y,
                        label: pt.data.label,
                        value: pt.val,
                        count: pt.data.count,
                      })
                    }
                    onMouseLeave={() => setHoveredPoint(null)}
                  />
                </g>
              ))}
            </svg>

            {/* Hover Tooltip */}
            {hoveredPoint && (
              <div
                className="absolute transform -translate-x-1/2 -translate-y-full pointer-events-none bg-charcoal-950/95 border border-charcoal-700 text-white px-2.5 py-1.5 rounded-lg shadow-2xl backdrop-blur-md z-30 font-mono text-[11px]"
                style={{
                  left: `${(hoveredPoint.x / chartData.width) * 100}%`,
                  top: `${(hoveredPoint.y / chartData.height) * 100 - 8}%`,
                }}
              >
                <div className="font-semibold text-zinc-200">{hoveredPoint.label}</div>
                <div className="text-crimson-400 font-bold mt-0.5">
                  {hoveredPoint.value} {metricTab} ({hoveredPoint.count} tracks)
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="h-[180px] flex items-center justify-center text-zinc-500 font-mono text-xs">
            {statsLoading ? 'Calculating listening analytics...' : 'No activity recorded yet for the last 14 days.'}
          </div>
        )}
      </div>

      {/* Top Artists & Top Genres Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Top Artists */}
        <div className="bg-charcoal-850/80 border border-charcoal-800 rounded-xl p-4 backdrop-blur-md">
          <div className="flex items-center space-x-2 mb-3 text-zinc-300">
            <Flame size={15} className="text-amber-400" />
            <h3 className="text-xs font-bold uppercase tracking-wider font-mono">Most Played Artists</h3>
          </div>

          <div className="space-y-2">
            {stats?.topArtists && stats.topArtists.length > 0 ? (
              stats.topArtists.map((artist, idx) => {
                const maxArtistPlays = stats.topArtists[0]?.playCount || 1;
                const pct = Math.max(8, Math.round((artist.playCount / maxArtistPlays) * 100));

                return (
                  <div key={idx} className="group flex flex-col space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-zinc-200 truncate group-hover:text-crimson-400 transition">
                        {idx + 1}. {artist.name}
                      </span>
                      <span className="font-mono text-[10px] text-zinc-400 shrink-0">
                        {artist.playCount} plays ({artist.minutes}m)
                      </span>
                    </div>
                    <div className="w-full h-1.5 bg-charcoal-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-crimson-700 to-crimson-500 rounded-full transition-all duration-500"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="text-xs text-zinc-500 font-mono py-4 text-center">
                Play some tracks to populate artist statistics.
              </div>
            )}
          </div>
        </div>

        {/* Top Genres */}
        <div className="bg-charcoal-850/80 border border-charcoal-800 rounded-xl p-4 backdrop-blur-md">
          <div className="flex items-center space-x-2 mb-3 text-zinc-300">
            <Layers size={15} className="text-cyan-400" />
            <h3 className="text-xs font-bold uppercase tracking-wider font-mono">Genre Breakdown</h3>
          </div>

          <div className="space-y-2">
            {stats?.topGenres && stats.topGenres.length > 0 ? (
              stats.topGenres.map((genre, idx) => {
                const maxGenrePlays = stats.topGenres[0]?.count || 1;
                const pct = Math.max(8, Math.round((genre.count / maxGenrePlays) * 100));

                return (
                  <div key={idx} className="group flex flex-col space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-zinc-200 truncate">
                        {idx + 1}. {genre.name}
                      </span>
                      <span className="font-mono text-[10px] text-zinc-400 shrink-0">
                        {genre.count} plays
                      </span>
                    </div>
                    <div className="w-full h-1.5 bg-charcoal-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-cyan-600 to-indigo-500 rounded-full transition-all duration-500"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="text-xs text-zinc-500 font-mono py-4 text-center">
                Genre data will populate as you listen.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Chronological Play History Table */}
      <div className="bg-charcoal-850/90 border border-charcoal-800 rounded-xl overflow-hidden shadow-xl backdrop-blur-md">
        <div className="p-3.5 sm:p-4 border-b border-charcoal-800 flex items-center justify-between">
          <div className="flex items-center space-x-2 text-zinc-200">
            <Clock size={16} className="text-crimson-400" />
            <h3 className="text-sm font-bold">Recently Played Tracks</h3>
            {history && (
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-charcoal-800 text-zinc-400 border border-charcoal-750">
                {history.length} tracks
              </span>
            )}
          </div>
        </div>

        {/* Tracks List */}
        <div className="divide-y divide-charcoal-800/60 max-h-[480px] overflow-y-auto">
          {historyLoading ? (
            <div className="p-8 text-center text-zinc-500 font-mono text-xs">Loading play history...</div>
          ) : !history || history.length === 0 ? (
            <div className="p-8 text-center text-zinc-500 space-y-2">
              <Music size={32} className="mx-auto text-zinc-700" />
              <p className="text-sm text-zinc-400">No play history recorded yet.</p>
              <p className="text-xs text-zinc-600">Start playing music to record your history.</p>
            </div>
          ) : (
            history.map((item, index) => {
              const isCurrent = currentTrack?.id === item.trackId;
              const trackObj: Track = (item.track as Track) || {
                id: item.trackId,
                title: item.title,
                artistName: item.artistName,
                albumTitle: item.albumTitle,
                duration: item.duration,
                isLossless: item.isLossless,
                artworkId: item.artworkId,
                relativePath: '',
                filename: '',
                fileSize: 0,
                rootId: '',
              };

              return (
                <div
                  key={`${item.trackId}-${index}`}
                  onDoubleClick={() => playTrack(trackObj)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setContextMenu({ x: e.clientX, y: e.clientY, track: trackObj });
                  }}
                  className={`flex items-center justify-between px-3 sm:px-4 py-2 hover:bg-charcoal-800/80 transition cursor-pointer group ${
                    isCurrent ? 'bg-crimson-950/40 border-l-2 border-crimson-600' : ''
                  }`}
                >
                  {/* Left: Artwork, Title, Artist */}
                  <div className="flex items-center space-x-3 truncate max-w-[65%] sm:max-w-[70%]">
                    {/* Artwork & Play button */}
                    <div
                      onClick={(e) => {
                        e.stopPropagation();
                        playTrack(trackObj);
                      }}
                      className="w-9 h-9 rounded bg-charcoal-800 overflow-hidden relative shrink-0 border border-charcoal-750 group/art"
                    >
                      {item.artworkId ? (
                        <img
                          src={api.getArtworkUrl(item.artworkId, 96)}
                          alt=""
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-zinc-600">
                          <Music size={14} />
                        </div>
                      )}

                      <div className="absolute inset-0 bg-black/50 opacity-0 group-hover/art:opacity-100 flex items-center justify-center transition">
                        <Play size={14} className="text-white fill-white ml-0.5" />
                      </div>
                    </div>

                    <div className="truncate min-w-0">
                      <div className="flex items-center space-x-1.5 truncate">
                        <span
                          className={`text-xs truncate font-medium ${
                            isCurrent ? 'text-crimson-400 font-bold' : 'text-zinc-200'
                          }`}
                        >
                          {item.title}
                        </span>
                        {item.isLossless && (
                          <span className="font-mono text-[8.5px] px-1 py-0.2 rounded bg-emerald-950 text-emerald-400 border border-emerald-800/50 shrink-0">
                            FLAC
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-zinc-400 truncate">
                        {item.artistName} • <span className="text-zinc-500">{item.albumTitle}</span>
                      </div>
                    </div>
                  </div>

                  {/* Right: Timestamp & Duration */}
                  <div className="flex items-center space-x-3 shrink-0 text-right font-mono">
                    <span className="text-[10px] text-zinc-500 hidden sm:inline">
                      {formatRelativeTime(item.lastPlayedAt)}
                    </span>
                    <span className="text-xs text-zinc-400 w-12 text-right">
                      {formatDuration(item.duration)}
                    </span>

                    {/* Quick action buttons on hover */}
                    <div className="hidden group-hover:flex items-center space-x-1">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          playNext(trackObj);
                        }}
                        title="Play Next"
                        className="p-1 text-zinc-400 hover:text-white hover:bg-charcoal-750 rounded transition"
                      >
                        <ListPlus size={13} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Right-click Context Menu */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          selectedTracks={[contextMenu.track]}
          onClose={() => setContextMenu(null)}
          onPlay={() => playTrack(contextMenu.track)}
          onPlayNext={() => playNext(contextMenu.track)}
          onAddToQueue={() => addToQueue(contextMenu.track)}
          onToggleFavorite={() => {}}
          onLocateAlbum={() => {
            if (contextMenu.track.albumId) {
              setHighlightedAlbumId(contextMenu.track.albumId);
              setViewMode('albumGrid');
            }
          }}
          onOpenProperties={() => openTrackProperties(contextMenu.track)}
        />
      )}
    </div>
  );
};
