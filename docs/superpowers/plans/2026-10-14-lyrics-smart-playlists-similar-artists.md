# Lyrics Engine, Smart Playlists & Similar Artists Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement synchronized & plain lyrics with Right Panel display, five dynamic Smart Playlists in the Left Sidebar, and an Encyclopaedia Metallum / Last.fm Similar Artists resolver in the Artist Detail View.

**Architecture:** 
1. Backend Lyrics Service with priority cascade (local `.lrc` sidecar file -> embedded tags via music-metadata -> LRCLIB open API fallback) and local disk caching under `server/data/lyrics/`.
2. Backend Smart Playlists route querying SQLite dynamically with optimized SQL for Top 100, Recently Added, Pure Lossless, Epic Length (>10 min), and Forgotten Relics.
3. Backend Similar Artists service resolving band recommendations from Metal Archives / Last.fm, cross-matching them against the local Black Library database, and caching results in `Artist.similarArtists`.
4. Web client UI updates: Synced auto-scrolling lyrics tab in `RightPanel.tsx`, Smart Playlists section in `LeftSidebar.tsx` and main TrackTable, and Similar Bands carousel in `ArtistDetailView.tsx`.

**Tech Stack:** React 18, Fastify, Prisma, SQLite, Web Audio API, LRCLIB API, Metal Archives scraper, Tailwind CSS, Lucide icons.

---

### Task 1: Database & Storage Setup

**Files:**
- Modify: `server/prisma/schema.prisma:40-55`
- Create: `server/data/lyrics/` (directory)

- [ ] **Step 1: Add `similarArtists` column to `Artist` in `server/prisma/schema.prisma`**

In `server/prisma/schema.prisma`:
```prisma
model Artist {
  id             String    @id @default(uuid())
  name           String    @unique
  normalizedName String
  bio            String?
  photoPath      String?
  logoPath       String?
  discogsId      Int?
  metallumId     String?
  similarArtists String?   // JSON string: Array<{ name: string, score?: number, inLibrary: boolean, libraryArtistId?: string, trackCount?: number }>
  artFetchedAt   DateTime?
  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt

  tracks         Track[]
  albums         Album[]
}
```

- [ ] **Step 2: Push database schema and ensure `server/data/lyrics` directory exists**

Run:
```bash
npx prisma db push --schema=server/prisma/schema.prisma
```
Verify that the `similarArtists` column is created in SQLite and create the `server/data/lyrics` folder.

---

### Task 2: Backend Lyrics Service & Route

**Files:**
- Create: `server/src/lyrics/lyricsService.ts`
- Create: `server/src/routes/lyrics.ts`
- Modify: `server/src/index.ts`
- Create: `scratch/test_lyrics.ts`

- [ ] **Step 1: Implement `lyricsService.ts`**

In `server/src/lyrics/lyricsService.ts`:
- Check for sidecar files: `<trackDir>/<basename>.lrc`, `<trackDir>/<basename>.txt`, `<fullPath>.lrc`.
- Parse LRC timestamps: regex `/\[(\d{2}):(\d{2})(?:\.(\d{2,3}))?\](.*)/`.
- Read embedded metadata lyrics using `music-metadata`.
- Query LRCLIB API: `https://lrclib.net/api/get?artist_name=${artist}&track_name=${title}&album_name=${album}&duration=${duration}`.
- Cache to `server/data/lyrics/${trackId}.lrc`.
- Return structured format:
```ts
export interface LyricsResult {
  source: 'sidecar' | 'embedded' | 'cached' | 'online' | 'none';
  hasSyncedLyrics: boolean;
  lines: Array<{ time: number; text: string }>;
  plainLyrics?: string;
}
```

- [ ] **Step 2: Implement `server/src/routes/lyrics.ts`**

Register routes:
- `GET /api/tracks/:id/lyrics`: Fetch lyrics using `lyricsService.getLyrics(trackId)`.
- `POST /api/tracks/:id/lyrics/refetch`: Force online re-fetch ignoring cache.

- [ ] **Step 3: Register lyrics routes in `server/src/index.ts`**

Mount `lyricsRoutes` under `/api/lyrics` or `/api/tracks/:id/lyrics`.

- [ ] **Step 4: Test lyrics service with `scratch/test_lyrics.ts`**

Run test on sample track to verify sidecar detection, LRCLIB query, and parsing.

---

### Task 3: Backend Smart Playlists Service & Route

**Files:**
- Create: `server/src/routes/smartPlaylists.ts`
- Modify: `server/src/index.ts`
- Create: `scratch/test_smart_playlists.ts`

- [ ] **Step 1: Implement `server/src/routes/smartPlaylists.ts`**

Define endpoints:
- `GET /api/smart-playlists`: Returns catalog of 5 presets:
  - `top-played`: "Top 100 Most Played"
  - `recently-added`: "Recently Added (Last 30 Days)"
  - `lossless-vault`: "Pure Lossless Vault (FLAC/WAV)"
  - `epic-length`: "Epic Length (> 10 Min)"
  - `forgotten-relics`: "Forgotten Relics (0 Play Count)"
- `GET /api/smart-playlists/:key`: Queries tracks for the requested preset using raw SQL with standard track formatting (including collectionName, combinedPlayCount, isLossless, bitrate, etc.).

- [ ] **Step 2: Register `smartPlaylistsRoutes` in `server/src/index.ts`**

Mount under `/api/smart-playlists`.

- [ ] **Step 3: Test smart playlists endpoint with `scratch/test_smart_playlists.ts`**

Verify all 5 preset keys return valid track arrays within < 50ms.

---

### Task 4: Backend Similar Artists Service & Route

**Files:**
- Create: `server/src/artists/similarArtistsService.ts`
- Modify: `server/src/routes/artists.ts`
- Create: `scratch/test_similar_artists.ts`

- [ ] **Step 1: Implement `similarArtistsService.ts`**

1. Query Metal Archives recommendations using `metallumId` or band search if available.
2. Fallback to Last.fm `artist.getSimilar` API (`LASTFM_API_KEY`).
3. For each similar band name:
   - Match against local database `prisma.artist.findFirst({ where: { name: { equals: name } } })` or normalized name comparison.
   - If matched: mark `inLibrary: true`, include `libraryArtistId`, `trackCount`, `albumCount`.
   - If not matched: mark `inLibrary: false`.
4. Cache serialized JSON to `Artist.similarArtists` in database.

- [ ] **Step 2: Add `GET /api/artists/:id/similar` endpoint in `server/src/routes/artists.ts`**

Return `{ artistId, similar: Array<{ name, score, inLibrary, libraryArtistId?, trackCount?, albumCount? }> }`.

- [ ] **Step 3: Test similar artists with `scratch/test_similar_artists.ts`**

Run on a sample artist (e.g. `Butcher ABC` or `Mayhemic Truth`) and verify local library cross-matching.

---

### Task 5: Client Types & API Client

**Files:**
- Modify: `client/src/types.ts`
- Modify: `client/src/api/client.ts`

- [ ] **Step 1: Add types in `client/src/types.ts`**

Add:
- `LyricsLine`, `LyricsData`
- `SmartPlaylistPreset`, `SmartPlaylistKey`
- `SimilarArtistItem`, `SimilarArtistsResponse`

- [ ] **Step 2: Add API methods in `client/src/api/client.ts`**

Add:
- `api.getTrackLyrics(trackId: string)`
- `api.refetchTrackLyrics(trackId: string)`
- `api.getSmartPlaylists()`
- `api.getSmartPlaylist(key: string)`
- `api.getSimilarArtists(artistId: string)`

---

### Task 6: Client UI - Synchronized Lyrics Tab in Right Panel

**Files:**
- Modify: `client/src/components/RightPanel.tsx`

- [ ] **Step 1: Add "Lirik" tab header in `RightPanel.tsx`**

Expand tab state:
```tsx
const [activeTab, setActiveTab] = useState<'queue' | 'history' | 'lyrics'>('queue');
```

- [ ] **Step 2: Build synchronized lyrics view**

Features:
- Query `api.getTrackLyrics(currentTrack.id)` when `activeTab === 'lyrics'` and track exists.
- Track active line based on `currentTime` from `usePlayerStore`.
- Smooth auto-scroll with `lineRef.scrollIntoView({ behavior: 'smooth', block: 'center' })`.
- Click on any lyric line to seek: `seek(line.time)`.
- Clean styled typography for plain text fallback.
- "Cari Lirik Online" retry button if lyrics not found.

---

### Task 7: Client UI - Smart Playlists in Left Sidebar & Main View

**Files:**
- Modify: `client/src/store/uiStore.ts`
- Modify: `client/src/components/LeftSidebar.tsx`
- Modify: `client/src/App.tsx`

- [ ] **Step 1: Update `uiStore.ts`**

Add:
- `selectedSmartPlaylistKey: string | null`
- `selectSmartPlaylist: (key: string | null) => void`
- Ensure selecting a smart playlist sets `activeSection: 'smart-playlist'`.

- [ ] **Step 2: Update `LeftSidebar.tsx`**

Under Playlists, render:
- **Smart Playlists** section with 5 items:
  - 🔥 Top 100
  - 🕒 Baru Ditambahkan
  - 💎 Lossless Vault
  - ⏳ Durasi Panjang (>10m)
  - 🕯️ Koleksi Terlupakan
- Active highlighting when `selectedSmartPlaylistKey === key`.

- [ ] **Step 3: Update `App.tsx`**

When `activeSection === 'smart-playlist'`, render:
- Custom header banner showing playlist title, icon, description, total tracks, total duration.
- "Play All" and "Shuffle" buttons.
- `TrackTable` rendering the smart playlist tracks.

---

### Task 8: Client UI - Similar Artists Carousel in Artist Detail View

**Files:**
- Modify: `client/src/components/ArtistDetailView.tsx`

- [ ] **Step 1: Add Similar Artists query and carousel in `ArtistDetailView.tsx`**

Features:
- `useQuery` for `api.getSimilarArtists(artistId)`.
- Render horizontal scrollable container below bio.
- For `inLibrary: true`: subtle crimson/emerald border, "In Library" badge, track count, clicking calls `selectArtist(band.libraryArtistId)`.
- For `inLibrary: false`: muted badge, external discovery indicator.

---

### Task 9: Full Build, Verification & End-to-End Test

**Files:**
- Run: Build and test scripts

- [ ] **Step 1: Run client & server builds**

Run:
```bash
npm run build
```
Verify:
1. `npm run build:client` builds Vite bundle with zero errors.
2. `scripts/copy-client.js` copies to `server/public`.
3. `npm run build:server` compiles TypeScript with `scripts/copy-generated.js` copying Prisma client.
4. Total build succeeds with code 0.

- [ ] **Step 2: Run end-to-end integration test**

Execute `scratch/test_full_suite.ts` to verify all routes (`/api/tracks/:id/lyrics`, `/api/smart-playlists`, `/api/artists/:id/similar`).
