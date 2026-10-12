import React, { useState } from 'react';
import { X, Copy, Check, FileAudio, Disc, Music, HardDrive, Cpu, Calendar, Clock, BarChart2 } from 'lucide-react';
import { useUiStore } from '../store/uiStore';

function formatTime(sec?: number): string {
  if (!sec || isNaN(sec) || sec <= 0) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

function formatFileSize(bytes?: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }
  return `${size.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

export const TrackPropertiesModal: React.FC = () => {
  const { isTrackPropertiesOpen, propertiesTrack, closeTrackProperties } = useUiStore();
  const [copiedField, setCopiedField] = useState<string | null>(null);

  if (!isTrackPropertiesOpen || !propertiesTrack) return null;

  const track = propertiesTrack;

  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(label);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const handleCopyAll = () => {
    const summary = [
      `Track: ${track.title}`,
      `Artist: ${track.artistName}`,
      `Album: ${track.albumTitle}`,
      `Year: ${track.year ?? 'Unknown'}`,
      `Genre: ${track.genre ?? 'Unknown'}`,
      `Format / Codec: ${track.codec?.toUpperCase() ?? track.extension.toUpperCase()}`,
      `Bit Depth: ${track.bitDepth ? `${track.bitDepth}-bit` : 'N/A'}`,
      `Sample Rate: ${track.sampleRate ? `${(track.sampleRate / 1000).toFixed(1)} kHz (${track.sampleRate} Hz)` : 'N/A'}`,
      `Bitrate: ${track.bitrate ? `${Math.round(track.bitrate)} kbps` : 'N/A'}`,
      `Channels: ${track.channels === 1 ? 'Mono' : track.channels === 2 ? 'Stereo' : `${track.channels ?? 2} channels`}`,
      `Duration: ${formatTime(track.duration)}`,
      `File Size: ${formatFileSize(track.fileSize)}`,
      `File Name: ${track.filename}`,
      `Relative Path: ${track.relativePath}`,
      `Collection: ${track.collectionName}`,
    ].join('\n');

    handleCopy(summary, 'all');
  };

  const isHiRes = (track.bitDepth && track.bitDepth > 16) || (track.sampleRate && track.sampleRate > 48000);

  return (
    <div
      onClick={closeTrackProperties}
      className="fixed inset-0 z-50 bg-black/85 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 select-none overflow-y-auto"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-charcoal-900 border border-charcoal-700 w-full max-w-2xl rounded-xl shadow-2xl overflow-hidden flex flex-col text-xs my-auto"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-charcoal-950 border-b border-charcoal-800">
          <div className="flex items-center space-x-2">
            <FileAudio size={18} className="text-crimson-500" />
            <h2 className="font-semibold text-zinc-100 text-sm">Audio Track Properties & Tech Specs</h2>
          </div>
          <button
            onClick={closeTrackProperties}
            className="p-1 text-zinc-400 hover:text-zinc-100 hover:bg-charcoal-800 rounded transition"
          >
            <X size={16} />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-4 sm:p-5 flex flex-col gap-4 max-h-[75vh] overflow-y-auto">
          {/* Track Summary Banner */}
          <div className="flex items-center gap-4 bg-charcoal-950/70 p-3.5 rounded-lg border border-charcoal-800">
            {track.artworkId ? (
              <img
                src={`/api/artwork/${track.artworkId}`}
                alt={track.albumTitle}
                className="w-16 h-16 sm:w-20 sm:h-20 rounded-md object-cover border border-charcoal-700 shrink-0 shadow-md"
              />
            ) : (
              <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-md bg-charcoal-800 border border-charcoal-700 flex items-center justify-center shrink-0 text-zinc-600">
                <Disc size={28} />
              </div>
            )}

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <h3 className="text-sm sm:text-base font-bold text-zinc-100 truncate">{track.title}</h3>
                {track.isLossless && (
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-950/50 text-amber-300 border border-amber-800/60">
                    LOSSLESS
                  </span>
                )}
                {isHiRes && (
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-crimson-950/50 text-crimson-300 border border-crimson-800/60">
                    HI-RES AUDIO
                  </span>
                )}
              </div>
              <p className="text-zinc-300 truncate font-medium">{track.artistName}</p>
              <p className="text-zinc-500 truncate text-[11px]">
                {track.albumTitle} {track.year ? `(${track.year})` : ''} • {track.genre || 'Metal / Ambient'}
              </p>
            </div>
          </div>

          {/* Audio Technical Specification Grid */}
          <div>
            <div className="flex items-center space-x-1.5 text-zinc-400 mb-2 font-semibold">
              <Cpu size={14} className="text-crimson-400" />
              <span>Audio Encoding & DSP Stream</span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {/* Codec */}
              <div className="bg-charcoal-950/50 border border-charcoal-800/80 p-2.5 rounded-lg">
                <span className="text-[10px] text-zinc-500 uppercase tracking-wider block">Container / Codec</span>
                <span className="font-mono text-zinc-200 font-semibold text-xs mt-0.5 block">
                  {track.codec?.toUpperCase() ?? track.extension.toUpperCase().replace('.', '')}
                </span>
                <span className="text-[10px] text-zinc-500">
                  {track.isLossless ? 'Lossless Compression' : 'Perceptual Audio Codec'}
                </span>
              </div>

              {/* Bit Depth */}
              <div className="bg-charcoal-950/50 border border-charcoal-800/80 p-2.5 rounded-lg">
                <span className="text-[10px] text-zinc-500 uppercase tracking-wider block">Bit Depth</span>
                <span className="font-mono text-zinc-200 font-semibold text-xs mt-0.5 block">
                  {track.bitDepth ? `${track.bitDepth}-bit` : '16-bit (Standard)'}
                </span>
                <span className="text-[10px] text-zinc-500">
                  {track.bitDepth && track.bitDepth > 16 ? 'High dynamic range' : 'Red Book CD standard'}
                </span>
              </div>

              {/* Sample Rate */}
              <div className="bg-charcoal-950/50 border border-charcoal-800/80 p-2.5 rounded-lg">
                <span className="text-[10px] text-zinc-500 uppercase tracking-wider block">Sample Rate</span>
                <span className="font-mono text-zinc-200 font-semibold text-xs mt-0.5 block">
                  {track.sampleRate ? `${(track.sampleRate / 1000).toFixed(1)} kHz` : '44.1 kHz'}
                </span>
                <span className="text-[10px] text-zinc-500">
                  {track.sampleRate ? `${track.sampleRate.toLocaleString()} samples/sec` : '44,100 samples/sec'}
                </span>
              </div>

              {/* Bitrate */}
              <div className="bg-charcoal-950/50 border border-charcoal-800/80 p-2.5 rounded-lg">
                <span className="text-[10px] text-zinc-500 uppercase tracking-wider block">Bitrate</span>
                <span className="font-mono text-zinc-200 font-semibold text-xs mt-0.5 block">
                  {track.bitrate ? `${Math.round(track.bitrate)} kbps` : 'Variable (VBR)'}
                </span>
                <span className="text-[10px] text-zinc-500">Stream transmission density</span>
              </div>

              {/* Channels */}
              <div className="bg-charcoal-950/50 border border-charcoal-800/80 p-2.5 rounded-lg">
                <span className="text-[10px] text-zinc-500 uppercase tracking-wider block">Channels</span>
                <span className="font-mono text-zinc-200 font-semibold text-xs mt-0.5 block">
                  {track.channels === 1 ? '1 Channel (Mono)' : track.channels === 2 ? '2 Channels (Stereo)' : `${track.channels ?? 2} Channels`}
                </span>
                <span className="text-[10px] text-zinc-500">Spatial channel configuration</span>
              </div>

              {/* Duration */}
              <div className="bg-charcoal-950/50 border border-charcoal-800/80 p-2.5 rounded-lg">
                <span className="text-[10px] text-zinc-500 uppercase tracking-wider block">Track Duration</span>
                <span className="font-mono text-zinc-200 font-semibold text-xs mt-0.5 block">
                  {formatTime(track.duration)}
                </span>
                <span className="text-[10px] text-zinc-500">{Math.round(track.duration)} total seconds</span>
              </div>
            </div>
          </div>

          {/* Storage & Filesystem Details */}
          <div>
            <div className="flex items-center space-x-1.5 text-zinc-400 mb-2 font-semibold">
              <HardDrive size={14} className="text-crimson-400" />
              <span>Storage & Library Location</span>
            </div>

            <div className="bg-charcoal-950/60 border border-charcoal-800 rounded-lg p-3 space-y-2.5">
              <div className="flex items-center justify-between text-[11px] pb-2 border-b border-charcoal-800/80">
                <span className="text-zinc-400">File Size:</span>
                <span className="font-mono text-zinc-200 font-medium">
                  {formatFileSize(track.fileSize)} ({track.fileSize.toLocaleString()} bytes)
                </span>
              </div>

              <div className="flex items-center justify-between text-[11px] pb-2 border-b border-charcoal-800/80">
                <span className="text-zinc-400">Filename:</span>
                <span className="font-mono text-zinc-200 font-medium truncate max-w-sm" title={track.filename}>
                  {track.filename}
                </span>
              </div>

              <div className="flex items-center justify-between text-[11px] pb-2 border-b border-charcoal-800/80">
                <span className="text-zinc-400">Root Collection:</span>
                <span className="text-zinc-200 font-medium">{track.collectionName}</span>
              </div>

              <div className="text-[11px]">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-zinc-400">Relative Path:</span>
                  <button
                    onClick={() => handleCopy(track.relativePath, 'path')}
                    className="flex items-center space-x-1 text-crimson-400 hover:text-crimson-300 font-medium hover:underline text-[10px]"
                  >
                    {copiedField === 'path' ? <Check size={11} /> : <Copy size={11} />}
                    <span>{copiedField === 'path' ? 'Copied!' : 'Copy Path'}</span>
                  </button>
                </div>
                <div className="bg-charcoal-900 border border-charcoal-750 p-2 rounded text-[10px] font-mono text-zinc-300 break-all select-all">
                  {track.relativePath}
                </div>
              </div>
            </div>
          </div>

          {/* Library History & Statistics */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            <div className="bg-charcoal-950/50 border border-charcoal-800/80 p-2.5 rounded-lg">
              <div className="flex items-center space-x-1 text-zinc-500 mb-0.5">
                <BarChart2 size={11} />
                <span className="text-[10px] uppercase tracking-wider">Play Count</span>
              </div>
              <span className="font-mono text-zinc-200 font-semibold text-xs">
                {track.combinedPlayCount ?? track.localPlayCount ?? 0} plays
              </span>
              <span className="text-[10px] text-zinc-500 block">
                {track.localPlayCount} local / {track.importedPlayCount} synced
              </span>
            </div>

            <div className="bg-charcoal-950/50 border border-charcoal-800/80 p-2.5 rounded-lg">
              <div className="flex items-center space-x-1 text-zinc-500 mb-0.5">
                <Calendar size={11} />
                <span className="text-[10px] uppercase tracking-wider">Date Added</span>
              </div>
              <span className="text-zinc-200 font-medium text-xs">
                {track.dateAdded ? new Date(track.dateAdded).toLocaleDateString() : 'Unknown'}
              </span>
              <span className="text-[10px] text-zinc-500 block">Library index entry</span>
            </div>

            <div className="bg-charcoal-950/50 border border-charcoal-800/80 p-2.5 rounded-lg col-span-2 sm:col-span-1">
              <div className="flex items-center space-x-1 text-zinc-500 mb-0.5">
                <Clock size={11} />
                <span className="text-[10px] uppercase tracking-wider">Last Played</span>
              </div>
              <span className="text-zinc-200 font-medium text-xs">
                {track.lastPlayed ? new Date(track.lastPlayed).toLocaleDateString() : 'Never'}
              </span>
              <span className="text-[10px] text-zinc-500 block">Streaming session log</span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 py-3 bg-charcoal-950 border-t border-charcoal-800 flex items-center justify-between">
          <button
            onClick={handleCopyAll}
            className="flex items-center space-x-1.5 px-3 py-1.5 bg-charcoal-800 hover:bg-charcoal-750 text-zinc-300 rounded font-medium text-xs transition border border-charcoal-700"
          >
            {copiedField === 'all' ? <Check size={13} className="text-green-400" /> : <Copy size={13} />}
            <span>{copiedField === 'all' ? 'All Specs Copied!' : 'Copy Full Specs'}</span>
          </button>

          <button
            onClick={closeTrackProperties}
            className="px-4 py-1.5 bg-crimson-700 hover:bg-crimson-600 text-white rounded font-medium text-xs transition shadow"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
