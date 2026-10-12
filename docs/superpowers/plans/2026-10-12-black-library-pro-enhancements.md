# Black Library Pro Enhancements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement 5 core high-impact enhancements: (1) SQLite Memory & MMAP concurrency optimization, (2) Gapless audio pre-buffering engine, (3) Mobile Fullscreen Now Playing Drawer, (4) Global Keyboard Shortcuts with Cheatsheet Modal, and (5) Multi-token instant search for 61,000+ tracks.

**Architecture:** Frontend built with React + Vite + Tailwind CSS + Web Audio API. Backend built with Node.js + Fastify + Prisma + SQLite. Enhancements add resilient pre-buffering to eliminate inter-track latency, full mobile touch drawer UX, comprehensive accessibility keyboard ergonomics, and memory-mapped SQLite performance.

**Tech Stack:** React 18, Zustand, Lucide React, Web Audio API, HTML5 Media Session, Fastify, Prisma, SQLite (WAL + MMAP).

---

### Task 1: SQLite Memory, Cache & MMAP Optimization

**Files:**
- Modify: `server/src/db.ts:19-35`

- [ ] **Step 1: Update SQLite PRAGMAs in `server/src/db.ts`**
Add `PRAGMA cache_size = -64000;`, `PRAGMA temp_store = MEMORY;`, and `PRAGMA mmap_size = 268435456;` (256MB memory-mapped I/O).

- [ ] **Step 2: Test database query performance**
Verify server boots with no SQLite errors and executes sample queries across 61k tracks in < 15ms.

---

### Task 2: Multi-Token Search Engine in Backend

**Files:**
- Modify: `server/src/routes/tracks.ts:15-80`

- [ ] **Step 1: Enhance search query parser in `server/src/routes/tracks.ts`**
Allow multi-word queries (e.g. "coldworld womb") to split by spaces and match across `artistName`, `title`, and `albumTitle` simultaneously using `AND: [...]`.

- [ ] **Step 2: Verify multi-word search endpoint via HTTP test**
Test `GET /api/tracks?search=coldworld+womb` and verify it matches track `Womb Of Emptiness` by `ColdWorld`.

---

### Task 3: Gapless Audio Pre-Buffering Engine

**Files:**
- Modify: `client/src/components/PlayerBar.tsx`

- [ ] **Step 1: Add secondary preload audio element & prefetch watcher**
When current track has $\le 15\text{s}$ remaining, look up `queue[nextIndex]` and pre-fetch its audio stream URL into an invisible `<audio preload="auto" />` element.

- [ ] **Step 2: Seamless handoff on track transition**
When track reaches EOF or onended triggers, next track starts instantly with zero HTTP handshake delay because stream segments are already warm in memory.

---

### Task 4: Global Keyboard Shortcuts & Cheatsheet Modal

**Files:**
- Create: `client/src/hooks/useKeyboardShortcuts.ts`
- Create: `client/src/components/KeyboardShortcutsModal.tsx`
- Modify: `client/src/App.tsx`
- Modify: `client/src/components/TopToolbar.tsx`

- [ ] **Step 1: Create `useKeyboardShortcuts.ts` hook**
Implement bindings for Space (play/pause), Arrows (seek/volume), Ctrl+Arrows (prev/next), M (mute), V (visualizer), E (equalizer), Q (queue), / (focus search), and ? (toggle cheatsheet). Guard inputs.

- [ ] **Step 2: Create `KeyboardShortcutsModal.tsx`**
A sleek dark glassmorphism modal showing retro `<kbd>` key badges and descriptions.

- [ ] **Step 3: Wire into App.tsx and TopToolbar.tsx**
Add a keyboard icon or help trigger in TopToolbar.

---

### Task 5: Mobile Fullscreen Now Playing Drawer

**Files:**
- Create: `client/src/components/MobileNowPlayingDrawer.tsx`
- Modify: `client/src/components/PlayerBar.tsx`
- Modify: `client/src/store/uiStore.ts`

- [ ] **Step 1: Add `isMobileNowPlayingOpen` state to `uiStore.ts`**
Export `isMobileNowPlayingOpen: boolean`, `setMobileNowPlayingOpen: (open: boolean) => void`.

- [ ] **Step 2: Create `MobileNowPlayingDrawer.tsx`**
Slide-up fullscreen drawer for mobile viewport with large artwork, glow, title, album, artist, scrubber, big touch controls, scrobble status, and quick EQ/Visualizer triggers.

- [ ] **Step 3: Connect tap in `PlayerBar.tsx`**
Tapping the mobile thumbnail / title bar opens the drawer.

---

### Task 6: Build, Verify, and Test

- [ ] **Step 1: Build client and server**
Run `npm run build`.

- [ ] **Step 2: Restart server daemon**
Restart `npm start` daemon on port 3000.

- [ ] **Step 3: Live browser verification**
Use `browser_subagent` to test keyboard shortcuts, gapless pre-buffer, search, and mobile view.
