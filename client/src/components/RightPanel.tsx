import React, { useState } from 'react';
import {
  Disc,
  ListMusic,
  Info,
  Trash2,
  X,
  Volume2,
  Play,
  FileAudio,
  Hash,
  Database,
} from 'lucide-react';
import { useUiStore } from '../store/uiStore';
import { usePlayerStore } from '../store/playerStore';
import { useResponsive } from '../hooks/useResponsive';
import { api } from '../api/client';

function formatDuration(sec: number): string {
  if (!sec || isNaN(sec)) return '--:--';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

export const RightPanel: React.FC = () => {
  const {
    rightPanelOpen,
    closeRightPanel,
    rightPanelWidth,
    setRightPanelWidth,
    toggleRightPanel,
    rightPanelTab,
    setRightPanelTab,
  } = useUiStore();

  const { isCompact } = useResponsive();

  const {
    currentTrack,
    isPlaying,
    queue,
    queueIndex,
    playTrack,
    removeFromQueue,
    clearQueue,
  } = usePlayerStore();

  const [isResizing, setIsResizing] = useState(false);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);

    const onMouseMove = (moveEvent: MouseEvent) => {
      const newWidth = window.innerWidth - moveEvent.clientX;
      setRightPanelWidth(newWidth);
    };

    const onMouseUp = () => {
      setIsResizing(false);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  if (!rightPanelOpen) return null;

  const artworkUrl = currentTrack?.id
    ? api.getTrackArtworkUrl(currentTrack.id, 512)
    : '/api/artwork/unknown';

  const totalQueueSeconds = queue.reduce((acc, t) => acc + (t.duration || 0), 0);

  return (
    <>
      {isCompact && (
        <div
          onClick={closeRightPanel}
          className="fixed inset-0 bg-black/75 backdrop-blur-xs z-40 lg:hidden"
        />
      )}
      <aside
        style={{ width: isCompact ? undefined : rightPanelWidth }}
        className={`bg-charcoal-950 border-l border-charcoal-750 flex flex-col select-none text-xs ${
          isCompact
            ? 'fixed inset-y-0 right-0 z-50 w-full sm:w-96 max-w-full shadow-2xl h-full'
            : 'relative shrink-0 h-full'
        }`}
      >
        {/* Resizing Handle */}
        {!isCompact && (
          <div
            onMouseDown={handleMouseDown}
            className={`absolute left-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-crimson-600 transition ${
              isResizing ? 'bg-crimson-600' : 'bg-transparent'
            }`}
          />
        )}

      {/* Header Tabs */}
      <div className="h-10 bg-charcoal-900 border-b border-charcoal-750 flex items-center justify-between px-3 shrink-0">
        <div className="flex items-center space-x-1">
          <button
            onClick={() => setRightPanelTab('nowPlaying')}
            className={`flex items-center space-x-1 px-2.5 py-1 rounded text-xs transition ${
              rightPanelTab === 'nowPlaying'
                ? 'bg-charcoal-800 text-zinc-100 font-medium'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Disc size={13} className="text-crimson-500" />
            <span>Now Playing</span>
          </button>

          <button
            onClick={() => setRightPanelTab('queue')}
            className={`flex items-center space-x-1 px-2.5 py-1 rounded text-xs transition ${
              rightPanelTab === 'queue'
                ? 'bg-charcoal-800 text-zinc-100 font-medium'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <ListMusic size={13} />
            <span>Queue ({queue.length})</span>
          </button>

          <button
            onClick={() => setRightPanelTab('details')}
            className={`flex items-center space-x-1 px-2.5 py-1 rounded text-xs transition ${
              rightPanelTab === 'details'
                ? 'bg-charcoal-800 text-zinc-100 font-medium'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Info size={13} />
            <span>Details</span>
          </button>
        </div>

        <button
          onClick={isCompact ? closeRightPanel : toggleRightPanel}
          title="Close panel"
          className="p-1 rounded text-zinc-500 hover:text-zinc-300 hover:bg-charcoal-800 transition"
        >
          <X size={14} />
        </button>
      </div>

      {/* Content Body */}
      <div className="flex-1 overflow-y-auto p-3 text-xs">
        {/* Tab 1: Now Playing */}
        {rightPanelTab === 'nowPlaying' && (
          <div className="space-y-4">
            {currentTrack ? (
              <>
                {/* Large Cover Artwork */}
                <div className="relative aspect-square w-full rounded-md bg-charcoal-900 overflow-hidden shadow-2xl border border-charcoal-800">
                  <img
                    src={artworkUrl}
                    alt={currentTrack.albumTitle}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = '/api/artwork/unknown';
                    }}
                  />
                  {isPlaying && (
                    <div className="absolute top-2 right-2 bg-charcoal-900/80 backdrop-blur px-2 py-0.5 rounded text-[10px] font-mono text-crimson-400 border border-charcoal-700 flex items-center space-x-1">
                      <Volume2 size={11} className="animate-pulse" />
                      <span>PLAYING</span>
                    </div>
                  )}
                </div>

                {/* Track Primary Info */}
                <div>
                  <h3 className="font-semibold text-sm text-zinc-100 truncate" title={currentTrack.title}>
                    {currentTrack.title}
                  </h3>
                  <p className="text-zinc-300 text-xs mt-0.5 truncate" title={currentTrack.artistName}>
                    {currentTrack.artistName}
                  </p>
                  <p className="text-zinc-500 text-xs truncate" title={currentTrack.albumTitle}>
                    {currentTrack.albumTitle} {currentTrack.year ? `(${currentTrack.year})` : ''}
                  </p>
                </div>

                {/* Technical Specs Card */}
                <div className="bg-charcoal-900 border border-charcoal-800 rounded p-2.5 space-y-1.5 font-mono text-[11px]">
                  <div className="text-zinc-500 uppercase tracking-wider text-[10px] font-semibold border-b border-charcoal-800 pb-1 flex items-center justify-between">
                    <span>Audio Stream Specification</span>
                    <span className="text-crimson-400">{currentTrack.isLossless ? 'LOSSLESS' : 'LOSSY'}</span>
                  </div>

                  <div className="flex justify-between">
                    <span className="text-zinc-500">Codec / Format:</span>
                    <span className="text-zinc-200">{currentTrack.codec || 'Direct Stream'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Bitrate:</span>
                    <span className="text-zinc-200">{currentTrack.bitrate ? `${currentTrack.bitrate} kbps` : '-'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Sample Rate:</span>
                    <span className="text-zinc-200">{currentTrack.sampleRate ? `${currentTrack.sampleRate} Hz` : '-'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Channels:</span>
                    <span className="text-zinc-200">{currentTrack.channels === 2 ? 'Stereo (2ch)' : currentTrack.channels ? `${currentTrack.channels}ch` : '-'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Duration:</span>
                    <span className="text-zinc-200">{formatDuration(currentTrack.duration)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Collection:</span>
                    <span className="text-zinc-200">{currentTrack.collectionName}</span>
                  </div>
                </div>
              </>
            ) : (
              <div className="h-64 flex flex-col items-center justify-center text-zinc-600 text-center space-y-2">
                <Disc size={40} className="text-zinc-800 animate-spin" style={{ animationDuration: '8s' }} />
                <p className="text-zinc-400">No track playing</p>
                <p className="text-[11px] text-zinc-600">Select and double-click any track to begin streaming.</p>
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Queue */}
        {rightPanelTab === 'queue' && (
          <div className="flex flex-col h-full space-y-2">
            <div className="flex items-center justify-between text-zinc-400 font-mono text-[11px] pb-1 border-b border-charcoal-800">
              <span>Total Duration: {formatDuration(totalQueueSeconds)}</span>
              {queue.length > 0 && (
                <button
                  onClick={clearQueue}
                  className="flex items-center space-x-1 text-zinc-500 hover:text-red-400 transition"
                >
                  <Trash2 size={12} />
                  <span>Clear</span>
                </button>
              )}
            </div>

            {queue.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center text-zinc-600 py-12 text-center">
                <ListMusic size={32} className="text-zinc-800" />
                <p className="mt-2 text-zinc-400">Queue is empty</p>
                <p className="text-[11px] text-zinc-600">Right click tracks to queue them.</p>
              </div>
            ) : (
              <div className="space-y-1">
                {queue.map((track, idx) => {
                  const isCurrent = idx === queueIndex;
                  return (
                    <div
                      key={`${track.id}-${idx}`}
                      onClick={() => playTrack(track, queue)}
                      className={`group flex items-center justify-between p-1.5 rounded transition cursor-pointer ${
                        isCurrent
                          ? 'bg-crimson-950/60 border border-crimson-900/60 text-white font-medium'
                          : 'bg-charcoal-900 hover:bg-charcoal-850 text-zinc-300'
                      }`}
                    >
                      <div className="flex items-center space-x-2 truncate">
                        <span className="font-mono text-[10px] text-zinc-500 w-4 text-center">
                          {isCurrent ? <Volume2 size={12} className="text-crimson-400" /> : idx + 1}
                        </span>
                        <div className="truncate">
                          <p className="truncate text-xs leading-snug">{track.title}</p>
                          <p className="truncate text-[10.5px] text-zinc-500">{track.artistName}</p>
                        </div>
                      </div>

                      <div className="flex items-center space-x-2 pl-2 shrink-0">
                        <span className="font-mono text-[10px] text-zinc-500">{formatDuration(track.duration)}</span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            removeFromQueue(idx);
                          }}
                          className="opacity-0 group-hover:opacity-100 text-zinc-500 hover:text-red-400 transition p-0.5"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Tab 3: Track Details */}
        {rightPanelTab === 'details' && (
          <div className="space-y-3 font-mono text-[11px]">
            {currentTrack ? (
              <>
                <div className="bg-charcoal-900 border border-charcoal-800 rounded p-2.5 space-y-2">
                  <div className="text-zinc-400 font-semibold uppercase text-[10px] flex items-center space-x-1">
                    <FileAudio size={12} className="text-crimson-500" />
                    <span>File Metadata</span>
                  </div>
                  <div className="space-y-1 text-zinc-300">
                    <p><span className="text-zinc-500">Filename:</span> {currentTrack.filename}</p>
                    <p><span className="text-zinc-500">Relative Path:</span> {currentTrack.relativePath}</p>
                    {currentTrack.folderArtist && (
                      <p><span className="text-zinc-500">Folder Artist:</span> {currentTrack.folderArtist}</p>
                    )}
                    {currentTrack.folderAlbum && (
                      <p><span className="text-zinc-500">Folder Album:</span> {currentTrack.folderAlbum}</p>
                    )}
                    <p><span className="text-zinc-500">Size:</span> {(currentTrack.fileSize / 1024 / 1024).toFixed(2)} MB</p>
                    <p><span className="text-zinc-500">Date Added:</span> {new Date(currentTrack.dateAdded).toLocaleDateString()}</p>
                  </div>
                </div>

                <div className="bg-charcoal-900 border border-charcoal-800 rounded p-2.5 space-y-2">
                  <div className="text-zinc-400 font-semibold uppercase text-[10px] flex items-center space-x-1">
                    <Database size={12} className="text-crimson-500" />
                    <span>Playback & Provenance</span>
                  </div>
                  <div className="space-y-1 text-zinc-300">
                    <p><span className="text-zinc-500">Local Play Count:</span> {currentTrack.localPlayCount}</p>
                    <p><span className="text-zinc-500">MusicBee Imported:</span> {currentTrack.importedPlayCount}</p>
                    <p><span className="text-zinc-500">Combined Count:</span> {currentTrack.combinedPlayCount}</p>
                    <p><span className="text-zinc-500">Last Played:</span> {currentTrack.lastPlayed ? new Date(currentTrack.lastPlayed).toLocaleString() : 'Never'}</p>
                  </div>
                </div>
              </>
            ) : (
              <p className="text-zinc-500 text-center py-8">Select a track to inspect properties.</p>
            )}
          </div>
        )}
      </div>
    </aside>
  </>
  );
};
