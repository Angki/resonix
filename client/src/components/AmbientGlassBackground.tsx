import React from 'react';
import { useUiStore } from '../store/uiStore';
import { usePlayerStore } from '../store/playerStore';
import { api } from '../api/client';

export const AmbientGlassBackground: React.FC = () => {
  const { theme, ambientMotionEnabled } = useUiStore();
  const { currentTrack } = usePlayerStore();

  const isGlassTheme = theme === 'glass';
  const isResonanceTheme = theme === 'resonance';
  const shouldRender = isGlassTheme || isResonanceTheme || ambientMotionEnabled;

  if (!shouldRender) return null;

  const artworkUrl = currentTrack?.artworkId
    ? api.getArtworkUrl(currentTrack.artworkId, 256)
    : null;

  return (
    <div
      aria-hidden="true"
      className="fixed inset-0 pointer-events-none overflow-hidden z-0 select-none"
      style={{ opacity: isGlassTheme ? 1 : isResonanceTheme ? 0.6 : 0.45 }}
    >
      {/* Dynamic Cover Art Ambient Blob (Centers soft glow based on currently playing track) */}
      {artworkUrl && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[70vw] h-[70vh] max-w-[800px] max-h-[800px] transition-all duration-1000">
          <img
            src={artworkUrl}
            alt=""
            className="w-full h-full object-cover rounded-full blur-[130px] opacity-25 saturate-200 scale-125"
          />
        </div>
      )}

      {/* Floating Organic Color Orb 1: Rose or Resonant Electric Cyan */}
      <div
        className="absolute top-[-10%] left-[15%] w-[42vw] h-[42vw] min-w-[340px] min-h-[340px] rounded-full animate-orb-1"
        style={{
          background: isResonanceTheme
            ? 'radial-gradient(circle, rgba(6, 182, 212, 0.35) 0%, rgba(14, 116, 144, 0.12) 50%, transparent 70%)'
            : 'radial-gradient(circle, rgba(244, 63, 94, 0.28) 0%, rgba(225, 29, 72, 0.08) 50%, transparent 70%)',
          filter: 'blur(80px)',
        }}
      />

      {/* Floating Organic Color Orb 2: Electric Cyan / Sky Teal */}
      <div
        className="absolute bottom-[-15%] right-[10%] w-[48vw] h-[48vw] min-w-[380px] min-h-[380px] rounded-full animate-orb-2"
        style={{
          background: isResonanceTheme
            ? 'radial-gradient(circle, rgba(99, 102, 241, 0.32) 0%, rgba(67, 56, 202, 0.12) 50%, transparent 70%)'
            : 'radial-gradient(circle, rgba(6, 182, 212, 0.22) 0%, rgba(14, 116, 144, 0.08) 50%, transparent 70%)',
          filter: 'blur(90px)',
        }}
      />

      {/* Floating Organic Color Orb 3: Royal Violet / Deep Amethyst */}
      <div
        className="absolute top-[30%] right-[-10%] w-[38vw] h-[38vw] min-w-[300px] min-h-[300px] rounded-full animate-orb-3"
        style={{
          background: isResonanceTheme
            ? 'radial-gradient(circle, rgba(14, 165, 233, 0.28) 0%, rgba(3, 105, 161, 0.08) 50%, transparent 70%)'
            : 'radial-gradient(circle, rgba(168, 85, 247, 0.25) 0%, rgba(126, 34, 206, 0.06) 50%, transparent 70%)',
          filter: 'blur(85px)',
        }}
      />

      {/* Floating Organic Color Orb 4: Warm Solar Amber Glow */}
      <div
        className="absolute bottom-[10%] left-[-5%] w-[36vw] h-[36vw] min-w-[280px] min-h-[280px] rounded-full animate-orb-4"
        style={{
          background: 'radial-gradient(circle, rgba(245, 158, 11, 0.18) 0%, rgba(217, 119, 6, 0.05) 50%, transparent 70%)',
          filter: 'blur(80px)',
        }}
      />

      {/* Fine Glass Vignette Overlay */}
      <div className="absolute inset-0 bg-radial from-transparent via-transparent to-black/50" />
    </div>
  );
};
