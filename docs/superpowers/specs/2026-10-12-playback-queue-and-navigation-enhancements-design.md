# Design Specification: Playback Queue Continuity & Navigation Enhancements

**Date**: 2026-10-12  
**Target Project**: Black Library Music (`d:\Projects\music_stream`)  
**Status**: Approved  

---

## 1. Problem Statement & Objectives

### 1.1 Bugs & Issues
1. **Queue Playback Stalling in Inactive/Background Tabs**:
   - When playing an album or queue of tracks, only the first track finishes playing. Playback does not automatically advance to subsequent tracks when the browser tab is in the background or unfocused.
   - The browser tab notification / OS MediaSession widget disappears after track 1 finishes because the media element stops and subsequent `audio.play()` calls get blocked by browser background autoplay policies.
2. **Missing Alphabetical Quick-Jump Navigation**:
   - In large libraries (over 60,000 tracks), scrolling through thousands of artists or albums sorted alphabetically by Artist or Album is cumbersome without quick alphabetical index jumping.
3. **Missing Collection Shuffle Capability**:
   - Users cannot quickly shuffle an entire library/collection (e.g., "RAW BLACK METAL", "GORE", "NOISE", "DUNGEON SYNTHS") in one click.

### 1.2 Goals
- Guarantee continuous background playback across the entire queue without being interrupted or blocked by background browser throttling.
- Maintain consistent MediaSession notification presence in the OS and browser tab with active timeline position state.
- Add a sleek horizontal alphabetical mini-scroller bar (`#`, `A`–`Z`) above the track table and album grid when sorted by Artist Name or Album Title.
- Add a one-click "Shuffle All" button for each collection in the Left Sidebar and Top Toolbar with an optimized backend random sampler query.

---

## 2. Technical Architecture & Detailed Design

### 2.1 Background Queue Chaining & MediaSession Robustness

#### Root Cause
Currently, `PlayerBar.tsx` relies purely on `onEnded -> next() -> React re-render -> useEffect -> audio.src = newUrl; audio.play()`. In background tabs, Chromium and Firefox throttle React state updates and timers. By the time `useEffect` fires, the browser's audio continuation privilege window has expired. The browser flags the new `src` as an unprompted background autoplay attempt, rejects `audio.play()`, pauses the audio element, and drops the MediaSession notification.

#### Solution
1. **Synchronous Chaining in `onended`**:
   - In `PlayerBar.tsx`, inside `handleEnded()`:
     - Identify the next track directly from `usePlayerStore.getState().queue` and `queueIndex`.
     - If a valid next track exists:
       - Immediately update the audio element's `src` to the new stream URL: `audio.src = api.getStreamUrl(nextTrack.id, forceTranscode)`.
       - Immediately call `audio.play()` synchronously inside the `onended` event callback.
       - Synchronously update `navigator.mediaSession.metadata` for the new track.
       - Update the Zustand player store: `{ queueIndex: nextIndex, currentTrack: nextTrack, isPlaying: true, currentTime: 0, duration: nextTrack.duration }`.
       - Initiate the backend playback session via `api.startPlayback(nextTrack.id)`.
     - If no more tracks exist in the queue (or repeatMode is 'off'):
       - Gracefully stop playback and mark `isPlaying: false`.
2. **Continuous MediaSession Updates**:
   - In `handleTimeUpdate`, periodically call `navigator.mediaSession.setPositionState` with `{ duration, playbackRate, position }` when available.
   - Maintain action handlers for `play`, `pause`, `previoustrack`, `nexttrack`, `seekto`, `seekforward`, `seekbackward`.
3. **Resilient Error Recovery**:
   - In `audio.onError`, if a track fails to decode or transcode, automatically call `next()` after logging the warning rather than freezing the player on a dead stream.

---

### 2.2 Horizontal Alphabetical Mini-Scroller (A–Z)

#### Component Structure: `AlphabetBar.tsx`
- **Location**: Mounted above `TrackTable` and `AlbumGrid` (right below the toolbar / search filter area) whenever `sortBy === 'artistName'` or `sortBy === 'albumTitle'`.
- **Items**: `['#', 'A', 'B', 'C', ..., 'Z']`.
- **Styling**:
  - Compact, sleek horizontal bar styled in `bg-charcoal-900 border-b border-charcoal-800`.
  - Available letters (characters that exist in the active dataset) are highlighted with `text-zinc-300 hover:text-white hover:bg-charcoal-800`.
  - Unavailable letters are dimmed (`text-zinc-600 cursor-not-allowed pointer-events-none`).
  - Active letter is accentuated with `text-crimson-400 font-bold bg-charcoal-800/80`.
- **Interaction**:
  - Clicking a letter computes the index of the first item matching the letter.
  - In `TrackTable`: invokes `virtualizer.scrollToIndex(targetIndex, { align: 'start' })`.
  - In `AlbumGrid`: computes the virtual row index (`Math.floor(targetIndex / columnCount)`) and calls `rowVirtualizer.scrollToIndex(rowIndex, { align: 'start' })`.

---

### 2.3 Collection-Level Shuffle All

#### Backend Implementation (`server/src/routes/tracks.ts`)
- Add support for `sortBy === 'random'` or query parameter `shuffle=true`:
  - When `query.sortBy === 'random'` or `query.shuffle === 'true'`:
    - Instead of standard alphabetical sorting, execute SQLite random selection using `ORDER BY RANDOM() LIMIT :limit` (defaulting to 250 tracks).
    - Scope to `rootId` if requested, or across the whole library if `rootId` is omitted.
  - Returns formatted tracks instantly in milliseconds without transferring massive datasets.

#### Frontend UI: `LeftSidebar.tsx` & `TopToolbar.tsx`
- **LeftSidebar**:
  - In each collection row (and "All Collections"), render a subtle shuffle button `<button title="Shuffle Collection"><Shuffle size={12} /></button>`.
  - Clicking the shuffle button:
    - Fetches 250 randomized tracks from `api.getTracks({ rootId, sortBy: 'random', limit: 250 })`.
    - Immediately starts playback with `playTrack(randomTracks[0], randomTracks)` and sets `isShuffle: true`.
- **TopToolbar**:
  - When a collection is active, provide a dedicated "Shuffle Library" button alongside View Mode toggles.

---

## 3. Data Flow & State Management

```
[User Action: Shuffle Collection]
       │
       ▼
api.getTracks({ rootId, sortBy: 'random', limit: 250 })
       │
       ▼
Backend: Prisma / SQLite `ORDER BY RANDOM() LIMIT 250`
       │
       ▼
Client: `playTrack(tracks[0], tracks)` -> `usePlayerStore` (queue = 250 tracks, queueIndex = 0)
       │
       ▼
Audio Element starts Track 0 (Now Playing reported to backend & Last.fm)
       │
       ▼
Track 0 Ends -> `handleEnded` Event Callback
       │
       ├─► Synchronously sets `audio.src = getStreamUrl(track[1])`
       ├─► Synchronously calls `audio.play()`
       ├─► Synchronously updates `mediaSession.metadata`
       └─► Updates `usePlayerStore` queueIndex = 1
```

---

## 4. Verification & Testing Plan

1. **Queue Chaining Test**:
   - Play an album with 3+ tracks.
   - Switch to another browser tab or minimize window.
   - Fast-forward to the last 5 seconds of track 1.
   - Verify that track 2 begins immediately without stopping, and the browser media notification remains present and updates track title/artist.
2. **Alphabetical Jump Test**:
   - In Table View sorted by Artist, click letter "M".
   - Verify that the table scrolls smoothly to the first artist starting with "M".
   - Switch to Album Grid sorted by Album Title, click letter "D", verify grid scrolls to albums starting with "D".
3. **Shuffle Collection Test**:
   - In LeftSidebar, click the Shuffle button on "RAW BLACK METAL".
   - Verify queue is populated with randomized tracks from that collection and starts playback immediately.
