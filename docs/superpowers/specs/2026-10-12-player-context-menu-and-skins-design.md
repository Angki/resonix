# Design Specification: Player Context Menu, Source Locator, and New Themes

**Date:** 2026-10-12  
**Status:** Approved  
**Author:** Antigravity & User  
**Target App:** Black Library Personal Audio Streamer

---

## 1. Overview & Objectives

This enhancement introduces:
1. **PlayerBar Context Menu with Source Locator**:
   - Right-clicking the currently playing track area in `PlayerBar` brings up a custom context menu.
   - Features **"Go to Album (Locate in Library)"** which switches to the Album Grid, smoothly scrolls to the playing album, and applies a prominent animated highlight glow.
   - Quick actions to open the album tracklist modal, filter by artist, show in table mode, copy metadata, toggle favorite, and view technical file properties.
2. **Three New Visual Skins**:
   - **Glassmorphism (`glass`)**: Translucent frosted panels, backdrop blur (`backdrop-blur-md`), luminous glass borders, and neon glow accents.
   - **Metro Dark (`metro-dark`)**: Pure pitch-black (`#000000`), sharp flat typography inspired by Zune and Windows Phone, high contrast flat tiles.
   - **Metro Light (`metro-light`)**: Crisp flat white & slate-gray, high contrast black typography, minimalist flat borders.
3. **Audio File Properties Modal**:
   - View complete technical audio specifications: exact filesystem path, container format, bit depth (16/24-bit), sample rate (44.1/48/96 kHz), bitrate, channels, and lossless status.
4. **Volume Normalizer (Audio Compressor)**:
   - Web Audio API `DynamicsCompressorNode` toggle to equalize loudness disparities between quiet Dungeon Synth and loud Raw Black Metal / Noise tracks.

---

## 2. Architecture & Component Design

### 2.1 PlayerBar Context Menu (`PlayerContextMenu.tsx`)
- Triggered by `onContextMenu` on the left track info container in `PlayerBar.tsx`.
- Positioned dynamically using viewport clamping so it never overflows window boundaries.
- Menu Options:
  1. **Go to Album in Grid (Locate)**: 
     - Sets `viewMode = 'albumGrid'`.
     - Clears search or active filters if they hide the album.
     - Sets `highlightedAlbumId = currentTrack.albumId`.
     - Auto-scrolls to the album DOM card (`#album-${albumId}`) with smooth animation.
     - Adds a temporary 3-second animated glowing ring (`ring-2 ring-crimson-500 shadow-lg shadow-crimson-500/50`).
  2. **Open Album Tracklist**:
     - Fetches album object and opens `AlbumTracksModal`.
  3. **Show Album in Table Mode**:
     - Calls `selectAlbum(currentTrack.albumId, currentTrack.albumTitle)` and sets `viewMode = 'table'`.
  4. **Filter by Artist**:
     - Calls `selectArtist(currentTrack.artistId, currentTrack.artistName)` and sets `viewMode = 'table'`.
  5. **Copy Track Title**:
     - Writes `${currentTrack.artistName} - ${currentTrack.title}` to `navigator.clipboard`.
  6. **Track File Properties**:
     - Opens `TrackPropertiesModal` with complete audio metadata.

### 2.2 Album Card Locator in `AlbumGrid.tsx`
- Each album card renders an `id={`album-card-${album.id}`}`.
- Subscribes to `highlightedAlbumId` in `uiStore`.
- When `highlightedAlbumId` matches `album.id`:
  - Executes `element.scrollIntoView({ behavior: 'smooth', block: 'center' })`.
  - Applies glowing highlight classes for 3 seconds, then resets `highlightedAlbumId` to `null`.

### 2.3 Audio File Properties Modal (`TrackPropertiesModal.tsx`)
- Displays:
  - Title, Artist, Album, Year, Genre.
  - Duration, Track Number, Disc Number.
  - File Size (formatted in MB), File Extension / Codec.
  - Bitrate, Sample Rate, Bit Depth, Channels.
  - Absolute Filesystem Path (with quick "Copy Path" button).

### 2.4 Theme Engine Extensions
In `client/src/store/uiStore.ts`:
```ts
export type ThemeName =
  | 'blacklibrary'
  | 'spotify'
  | 'musicbee'
  | 'amber'
  | 'light'
  | 'glass'
  | 'metro-dark'
  | 'metro-light';
```

In `client/src/index.css`:
- `[data-theme="glass"]`:
  - `--theme-bg-950`: `rgba(10, 10, 14, 0.75)`
  - `--theme-bg-900`: `rgba(18, 18, 24, 0.65)`
  - `--theme-bg-850`: `rgba(24, 24, 32, 0.60)`
  - `--theme-bg-800`: `rgba(32, 32, 42, 0.55)`
  - Glass borders: `rgba(255, 255, 255, 0.10)`
  - Accent: Vibrant electric crimson / magenta.
  - Backdrop filter: `blur(12px)`.
- `[data-theme="metro-dark"]`:
  - `--theme-bg-950`: `#000000`
  - `--theme-bg-900`: `#050505`
  - `--theme-bg-850`: `#0c0c0c`
  - `--theme-bg-800`: `#141414`
  - Accent: Lumia Crimson `#e81123` or Cobalt Blue `#0078d7`.
  - Crisp flat borders (`#1f1f1f`).
- `[data-theme="metro-light"]`:
  - `--theme-bg-950`: `#f3f3f3`
  - `--theme-bg-900`: `#ffffff`
  - `--theme-bg-850`: `#f9f9f9`
  - `--theme-bg-800`: `#e5e5e5`
  - Accent: `#0078d7` or `#d13438`.
  - Crisp flat borders (`#cccccc`).

### 2.5 Web Audio Dynamics Normalizer (ReplayGain / Auto-Gain)
In `client/src/store/equalizerStore.ts` & `PlayerBar.tsx`:
- Adds `isNormalizerEnabled: boolean` and `toggleNormalizer: () => void`.
- In `PlayerBar.tsx`:
  - Instantiates `ctx.createDynamicsCompressor()`.
  - Threshold: `-24dB`, Knee: `30dB`, Ratio: `12`, Attack: `0.003s`, Release: `0.25s`.
  - Seamlessly bypasses or routes audio through the compressor before analyser node.

---

## 3. Verification Plan
1. **Context Menu Test**:
   - Right click on player bar left track info.
   - Verify context menu appears at mouse coordinates.
   - Click "Go to Album (Locate)", verify view switches to AlbumGrid, scrolls to the album, and card glows.
2. **File Properties Test**:
   - Right click -> "Properties".
   - Verify modal shows complete tech specs (codec, bitrate, sample rate, file path).
3. **Theme Switching**:
   - Switch between Glassmorphism, Metro Dark, and Metro Light.
   - Verify all panels and typography adapt cleanly.
4. **Volume Normalizer**:
   - Toggle normalizer on and verify dynamic compression smooths volume jumps without distortion.
