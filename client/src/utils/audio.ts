/**
 * Audio capability utilities for cross-platform playback
 */

/**
 * Detects if the current browser environment can natively decode FLAC audio.
 * iOS/iPadOS Safari, older Android WebViews, and certain mobile browsers
 * cannot decode raw audio/flac streams natively in HTML5 <audio>,
 * necessitating automatic fallback to the server's transcode endpoint.
 */
export function isBrowserFlacSupported(): boolean {
  if (typeof window === 'undefined' || typeof Audio === 'undefined') return true;
  try {
    const a = document.createElement('audio');
    const canPlay = a.canPlayType('audio/flac');
    return canPlay === 'probably' || canPlay === 'maybe';
  } catch {
    return false;
  }
}
