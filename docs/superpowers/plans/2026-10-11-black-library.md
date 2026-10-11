# Black Library Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a production-grade, fast, MusicBee-inspired web music player ("Black Library") running on Windows, streaming local music libraries over Tailscale with Last.fm scrobbling, MusicBee library/playlist imports, audio transcoding fallback, and virtualized rich UI.

**Architecture:** Monorepo with Fastify + Prisma (SQLite) + TypeScript backend and React 19/18 + Vite + Tailwind CSS + TanStack Table/Query + Zustand frontend. Backend serves single-origin static frontend in production, provides secure HTTP Range streaming, sharp-based artwork caching, bounded-concurrency recursive audio scanner, durable scrobbler, and MusicBee parser.

**Tech Stack:**
- Backend: Node.js (v24), TypeScript, Fastify, Prisma ORM, SQLite, music-metadata, sharp, fluent-ffmpeg / child_process FFmpeg, fastify-rate-limit, @fastify/cookie, @fastify/static, vitest.
- Frontend: React, Vite, TypeScript, Tailwind CSS, TanStack Table (v8), TanStack Virtual, TanStack Query (v5), Zustand, Lucide React.
- Networking & Security: Tailscale Serve documentation & relative paths, secure HttpOnly sessions, path traversal allowlist guards.

---

### Milestone 1: Project Scaffolding, Database Schema & Authentication
- [ ] Setup monorepo root `package.json`, TypeScript configs, backend structure (`server/`), and frontend structure (`client/`).
- [ ] Define comprehensive Prisma schema in `server/prisma/schema.prisma` covering: User, LibraryRoot, Track, Artist, Album, Artwork, Playlist, PlaylistTrack, UserTrackStats, PlaybackSession, PlaybackEvent, MusicBeeImport, ExternalTrackStats, LastFmAccount, ScrobbleJob, Setting.
- [ ] Run Prisma generate and initialize SQLite database `data/library.db`.
- [ ] Implement backend config validation, cryptographic secrets (`SESSION_SECRET`, `CREDENTIAL_ENCRYPTION_KEY`), password hashing with salt, session management, and auth API (`/api/auth/setup`, `/api/auth/login`, `/api/auth/logout`, `/api/auth/me`).

### Milestone 2: Audio Scanner, Metadata Extractor & Artwork Engine
- [ ] Implement path traversal guard and allowlist resolver for the 4 library roots (`D:\Music\RAW BLACK METAL`, `D:\Music\GORE`, `D:\Music\NOISE`, `D:\Music\DUNGEON SYNTHS`).
- [ ] Build recursive asynchronous scanner with bounded concurrency, mtime/size incremental checking, error resilience, progress reporting, and cancellation.
- [ ] Integrate `music-metadata` to parse ID3/Vorbis/FLAC tags (title, artist, album artist, album, track number, disc, year, genre, bitrate, sample rate, codec, duration).
- [ ] Build artwork extraction and thumbnail cache using `sharp` (supporting embedded artwork, folder images e.g. `cover.jpg`, `folder.jpg`, resized to small/medium/large thumbnails).
- [ ] Expose scanner API (`POST /api/library/scan`, `GET /api/library/status`, `GET /api/tracks`, `GET /api/artwork/:id`).

### Milestone 3: Robust Audio Streaming & FFmpeg Transcoding Engine
- [ ] Implement HTTP Range audio streaming (RFC 7233: 206 Partial Content, Content-Range, Accept-Ranges, HEAD requests, 416 validation).
- [ ] Verify FFmpeg binary availability (`ffmpeg -version` check) and configure transcoding fallback pipeline.
- [ ] Build transcode stream handler with seek offset (`-ss`), proper MIME types (e.g. audio/mp3 or audio/aac), client abort handling, and process termination.
- [ ] Test path security: reject any path outside configured library roots or non-whitelisted extensions.

### Milestone 4: Player Engine, Playback Sessions & Durable Scrobbler
- [ ] Implement playback session tracker (`POST /api/playback/start`, `POST /api/playback/progress`, `POST /api/playback/complete`).
- [ ] Enforce true listening time calculation (pauses and seeks do not inflate time; threshold >= 50% or 4 minutes) and prevent duplicate play counting.
- [ ] Build Last.fm integration with web authentication flow (`auth.getToken`, auth URL, `auth.getSession`), session key storage, and optional encrypted password fallback.
- [ ] Build durable scrobble queue with retry exponential backoff, rate limit handling, and API signature generation.

### Milestone 5: MusicBee Importer & Playlist Engine
- [ ] Build safe read-only parser for MusicBee candidate files in `C:\Users\angki\Music` (`.mbp` playlist binary format, `.xautopf` smart playlist XML format, `.mbl` strings & metadata mapping).
- [ ] Create importer service with dry-run preview, confidence matching, conflict review, and idempotent re-import without duplicating baseline play counts.
- [ ] Implement playlist API: CRUD playlists, reorder tracks, import/export M3U/M3U8, favorites, smart playlists.

### Milestone 6: MusicBee-Inspired Desktop UI
- [ ] Setup Tailwind CSS with dark charcoal/black palette and muted crimson accents, compact information-dense typography.
- [ ] Build MusicBee 5-zone layout:
  - Top Toolbar: Search, view switcher (Tracks / Albums / Artists), scan button & progress, settings modal trigger, Last.fm status.
  - Left Sidebar: Collections switcher, folder tree navigation, Artist/Album/Genre quick filter, Playlists, Smart Playlists, Favorites, History.
  - Center Panel: TanStack Table with virtualization, sortable/resizable columns (Title, Artist, Album, Year, Genre, Track#, Duration, Codec, Bitrate, Play Count, Rating), multi-selection, double-click to play, right-click context menu. Also Album Grid view.
  - Right Collapsible Panel: Now Playing details, large artwork, audio technical specs (sample rate, bit depth, codec), interactive Queue with drag/reorder/remove.
  - Bottom Player Bar: Persistent audio player with HTMLAudioElement + MediaSession, seek slider with buffered track progress, volume control, mute, repeat/shuffle, track quality badge, queue drawer toggle.
- [ ] Implement Zustand stores for player state, queue persistence, column visibility/widths, and user preferences in `localStorage`.
- [ ] Ensure non-stop audio playback across navigation and views.

### Milestone 7: Tailscale Documentation, Tests, Packaging & Verification
- [ ] Write automated tests: path validation, range requests, scanner upsert, deduplication, scrobble logic, MusicBee parser.
- [ ] Create PowerShell automation scripts (`setup.ps1`, `dev.ps1`, `build.ps1`, `start.ps1`, `install-service.ps1`).
- [ ] Test production build (frontend bundled and served from Fastify backend at single origin `127.0.0.1:3000`).
- [ ] Document Tailscale Serve HTTPS setup (`tailscale serve --bg http://127.0.0.1:3000`), firewall rules, backup/restore, troubleshooting.
- [ ] Run live scan of collection and perform complete verification.
