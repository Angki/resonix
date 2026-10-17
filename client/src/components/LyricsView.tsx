import React, { useEffect, useState, useRef } from 'react';
import { RefreshCw, Music2, FileText, Sparkles, AlertCircle } from 'lucide-react';
import { usePlayerStore } from '../store/playerStore';
import { api } from '../api/client';
import { LyricsData } from '../types';

export const LyricsView: React.FC = () => {
  const { currentTrack, currentTime, seek } = usePlayerStore();
  const [lyrics, setLyrics] = useState<LyricsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [refetching, setRefetching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeLineRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const userScrollingRef = useRef(false);
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!currentTrack?.id) {
      setLyrics(null);
      return;
    }

    let isMounted = true;
    setLoading(true);
    setError(null);

    api.getTrackLyrics(currentTrack.id)
      .then((data) => {
        if (isMounted) {
          setLyrics(data);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (isMounted) {
          setError(err?.message || 'Gagal memuat lirik');
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [currentTrack?.id]);

  // Determine active synced line based on currentTime
  let activeIndex = -1;
  if (lyrics?.isSynced && lyrics.lines && lyrics.lines.length > 0) {
    for (let i = lyrics.lines.length - 1; i >= 0; i--) {
      if (currentTime >= lyrics.lines[i].time - 0.25) {
        activeIndex = i;
        break;
      }
    }
  }

  // Smooth auto-scroll to active line
  useEffect(() => {
    if (userScrollingRef.current || activeIndex < 0 || !activeLineRef.current) return;

    activeLineRef.current.scrollIntoView({
      behavior: 'smooth',
      block: 'center',
    });
  }, [activeIndex]);

  const handleUserScroll = () => {
    userScrollingRef.current = true;
    if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
    scrollTimeoutRef.current = setTimeout(() => {
      userScrollingRef.current = false;
    }, 2500);
  };

  const handleRefetch = async () => {
    if (!currentTrack?.id || refetching) return;
    setRefetching(true);
    try {
      const data = await api.refetchTrackLyrics(currentTrack.id);
      setLyrics(data);
      setError(null);
    } catch (err: any) {
      setError(err?.message || 'Gagal mencari ulang lirik');
    } finally {
      setRefetching(false);
    }
  };

  if (!currentTrack) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center text-zinc-500 space-y-2">
        <Music2 size={32} className="opacity-40 text-zinc-600" />
        <p className="text-xs">Tidak ada lagu yang sedang diputar</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="space-y-4 py-8 animate-pulse">
        <div className="flex justify-between items-center px-1">
          <div className="h-4 bg-charcoal-800 rounded w-24"></div>
          <div className="h-4 bg-charcoal-800 rounded w-16"></div>
        </div>
        <div className="space-y-3 pt-4">
          <div className="h-3 bg-charcoal-800 rounded w-3/4 mx-auto"></div>
          <div className="h-4 bg-charcoal-750 rounded w-5/6 mx-auto"></div>
          <div className="h-3 bg-charcoal-800 rounded w-2/3 mx-auto"></div>
          <div className="h-3 bg-charcoal-800 rounded w-4/5 mx-auto"></div>
        </div>
      </div>
    );
  }

  const hasLyrics = lyrics && (lyrics.lines?.length || lyrics.plainText?.trim());

  return (
    <div className="flex flex-col h-full space-y-3">
      {/* Header Bar */}
      <div className="flex items-center justify-between pb-2 border-b border-charcoal-800/80 shrink-0">
        <div className="flex items-center space-x-2">
          {lyrics?.isSynced ? (
            <span className="flex items-center space-x-1 px-1.5 py-0.5 rounded text-[10px] font-mono bg-crimson-950/60 text-crimson-400 border border-crimson-800/50">
              <Sparkles size={10} />
              <span>SYNCED</span>
            </span>
          ) : hasLyrics ? (
            <span className="flex items-center space-x-1 px-1.5 py-0.5 rounded text-[10px] font-mono bg-charcoal-800 text-zinc-300 border border-charcoal-700">
              <FileText size={10} />
              <span>PLAIN</span>
            </span>
          ) : null}

          {lyrics?.source && lyrics.source !== 'none' && (
            <span className="text-[10px] text-zinc-500 font-mono">
              src: {lyrics.source}
            </span>
          )}
        </div>

        <button
          onClick={handleRefetch}
          disabled={refetching}
          title="Cari ulang online (LRCLIB)"
          className="flex items-center space-x-1 px-2 py-0.5 text-[10px] font-medium text-zinc-400 hover:text-zinc-200 bg-charcoal-800/80 hover:bg-charcoal-800 rounded border border-charcoal-750 transition disabled:opacity-50"
        >
          <RefreshCw size={10} className={refetching ? 'animate-spin text-crimson-400' : ''} />
          <span>{refetching ? 'Mencari...' : 'Cari Ulang'}</span>
        </button>
      </div>

      {/* Main Lyrics Body */}
      <div
        ref={containerRef}
        onScroll={handleUserScroll}
        className="flex-1 overflow-y-auto pr-1 space-y-3 text-center select-text"
      >
        {error && (
          <div className="p-3 bg-red-950/30 border border-red-800/40 rounded text-red-300 text-xs flex items-center space-x-2">
            <AlertCircle size={14} className="shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {!hasLyrics ? (
          <div className="py-16 text-center space-y-3 text-zinc-500">
            <p className="text-xs">Lirik belum tersedia untuk lagu ini.</p>
            <button
              onClick={handleRefetch}
              disabled={refetching}
              className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded text-xs font-medium bg-charcoal-800 text-zinc-200 hover:bg-crimson-900/60 hover:text-white border border-charcoal-700 hover:border-crimson-700 transition"
            >
              <RefreshCw size={12} className={refetching ? 'animate-spin' : ''} />
              <span>Cari di Database Online</span>
            </button>
          </div>
        ) : lyrics.isSynced && lyrics.lines ? (
          <div className="space-y-4 py-8">
            {lyrics.lines.map((line, idx) => {
              const isActive = idx === activeIndex;
              const isPast = idx < activeIndex;

              return (
                <div
                  key={`${line.time}-${idx}`}
                  ref={isActive ? activeLineRef : null}
                  onClick={() => seek(line.time)}
                  className={`cursor-pointer transition-all duration-300 rounded px-2 py-1 leading-relaxed ${
                    isActive
                      ? 'text-sm font-semibold text-zinc-100 bg-crimson-950/40 border border-crimson-800/40 shadow-xs scale-102'
                      : isPast
                      ? 'text-xs text-zinc-500 hover:text-zinc-300'
                      : 'text-xs text-zinc-600 hover:text-zinc-400'
                  }`}
                  title={`Klik untuk lompat ke ${Math.floor(line.time / 60)}:${String(Math.floor(line.time % 60)).padStart(2, '0')}`}
                >
                  {line.text || '♪'}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="py-4 text-xs text-zinc-300 leading-relaxed whitespace-pre-line font-sans text-left px-2">
            {lyrics.plainText}
          </div>
        )}
      </div>
    </div>
  );
};
