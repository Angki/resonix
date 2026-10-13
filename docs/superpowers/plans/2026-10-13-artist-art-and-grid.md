# Artist Artwork Engine & Artist Grouping Grid Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a multi-source Artist Artwork Engine (Local disk -> Metal Archives scraper -> Discogs API) that caches band logos and photos to disk, with a rich Artist Grid and Discography Grouping view in the web client.

**Architecture:** 
1. Database & Storage: Add `photoPath`, `logoPath`, `discogsId`, `metallumId`, `artFetchedAt` to `Artist` model in Prisma. Store cached images at `server/data/artists/`.
2. Artist Art Service: Cascade pipeline (Local folder -> Metallum scraper with 1.5s rate-limit -> Discogs REST API with user credentials). Background batch queue with status tracking.
3. Server Routes: Stream cached photo/logo with SVG avatar fallback, detail endpoints, and batch management.
4. Client UI: Dedicated `ArtistGrid.tsx` when `activeSection === 'artists'`, `ArtistDetailView.tsx` with hero photo + band logo banner and chronological albums, and Settings Integrations controls.

**Tech Stack:** React 18, Fastify, Prisma, SQLite, Discogs API, Cheerio / Axios, Tailwind CSS, Lucide icons.

---

### Task 1: Prisma Schema Update & Storage Directory

**Files:**
- Modify: `server/prisma/schema.prisma:40-51`
- Run: Prisma migration commands

- [ ] **Step 1: Update `Artist` model in `schema.prisma`**

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
  artFetchedAt   DateTime?
  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt

  tracks         Track[]
  albums         Album[]
}
```

- [ ] **Step 2: Push database schema and regenerate client**

Run:
```bash
npx prisma db push --schema=server/prisma/schema.prisma
npm run db:generate --workspace=server
```
Expected: Schema pushed successfully and Prisma client generated.

- [ ] **Step 3: Ensure `server/data/artists/` directory exists**

Create directory if it does not exist: `server/data/artists/`.

---

### Task 2: Backend Artwork Pipeline (Local, Metallum, Discogs)

**Files:**
- Create: `server/src/artists/localArtFinder.ts`
- Create: `server/src/artists/discogsClient.ts`
- Create: `server/src/artists/metallumScraper.ts`
- Create: `server/src/artists/artistArtService.ts`
- Create: `scratch/test_artist_art.ts`

- [ ] **Step 1: Implement `localArtFinder.ts`**

Inspect track paths for an artist to find their directory on disk (e.g. `D:/Music/GORE/Butcher ABC`). Check for:
- Photos: `artist.jpg`, `artist.png`, `band.jpg`, `folder.jpg`
- Logos: `logo.png`, `logo.jpg`, `band_logo.png`
Return `{ photoPath?: string, logoPath?: string }`.

- [ ] **Step 2: Implement `discogsClient.ts`**

Using Consumer Key `laXMILyXwnDtTqazBNJg` and Consumer Secret `JYyLsjmiqolHngZbrLXVGGzlUcOmHGZM`:
1. `searchArtist(artistName: string)`: `GET https://api.discogs.com/database/search?q=${name}&type=artist`
2. `getArtistDetails(id: number)`: `GET https://api.discogs.com/artists/${id}`
3. `downloadImage(url: string, destPath: string)`: Stream download to destination.

- [ ] **Step 3: Implement `metallumScraper.ts`**

1. Search endpoint: `GET https://www.metal-archives.com/search/ajax-band-search/?field=name&query=${encodeURIComponent(name)}`
2. Rate-limiter: ensure at least 1,500ms delay between calls.
3. Parse band page HTML: extract `#logo` href and `#photo` href.
4. Download and save to destination.

- [ ] **Step 4: Implement `artistArtService.ts`**

Orchestrate:
```ts
async function fetchArtistArt(artistId: string): Promise<ArtistArtResult>
```
1. Get artist and sample tracks.
2. Check local folder. If photo and logo found, save paths to DB and return.
3. If missing logo or photo, try Metallum (especially for metal/gore/death artists).
4. If still missing photo or bio, try Discogs.
5. Save downloaded files to `server/data/artists/${artistId}_photo.jpg` and `server/data/artists/${artistId}_logo.png`.
6. Update DB record: `photoPath`, `logoPath`, `bio`, `discogsId`, `metallumId`, `artFetchedAt = new Date()`.

- [ ] **Step 5: Test script & verify**

Create and run `scratch/test_artist_art.ts` on sample artists (e.g. `Butcher ABC`, `Vomitoma`, `Darkthrone`).
Verify photos and logos are stored in `server/data/artists/`.

---

### Task 3: Backend Routes & Stream Handlers

**Files:**
- Create: `server/src/routes/artists.ts`
- Modify: `server/src/index.ts`

- [ ] **Step 1: Implement `server/src/routes/artists.ts`**

Endpoints:
- `GET /api/artists`: List all artists with `id`, `name`, `albumCount`, `trackCount`, `hasPhoto: boolean`, `hasLogo: boolean`.
- `GET /api/artists/:id`: Detailed artist info with bio, albums grouped by year, tracks.
- `GET /api/artists/:id/photo`: Stream cached image file, or fallback SVG avatar (`Content-Type: image/svg+xml`).
- `GET /api/artists/:id/logo`: Stream cached logo image file, or 404.
- `POST /api/artists/:id/fetch-art`: On-demand trigger to fetch art.
- `POST /api/artists/batch-fetch`: Toggle background batch processing.
- `GET /api/artists/batch-status`: Get progress `{ total, processed, hasPhoto, hasLogo, isRunning, currentArtist }`.

- [ ] **Step 2: Register routes in `server/src/index.ts`**

Register `artistsRoutes` under `/api/artists`.

- [ ] **Step 3: Test endpoints with curl or test script**

Verify `GET /api/artists` and `GET /api/artists/:id/photo` return 200 OK.

---

### Task 4: Client API Client & Store Updates

**Files:**
- Modify: `client/src/api/client.ts`
- Modify: `client/src/store/uiStore.ts`
- Modify: `client/src/types.ts`

- [ ] **Step 1: Update `types.ts`**

Add `ArtistListItem` and `ArtistDetail` interfaces.

- [ ] **Step 2: Update `client.ts`**

Add:
- `api.getArtists()`
- `api.getArtist(id)`
- `api.getArtistPhotoUrl(id)`
- `api.getArtistLogoUrl(id)`
- `api.fetchArtistArt(id)`
- `api.getArtistBatchStatus()`
- `api.startArtistBatchFetch()`

- [ ] **Step 3: Update `uiStore.ts`**

Ensure `selectArtist(id, name)` properly activates artist view and preserves navigation state.

---

### Task 5: Frontend Artist Grid View

**Files:**
- Create: `client/src/components/ArtistGrid.tsx`
- Modify: `client/src/App.tsx`

- [ ] **Step 1: Create `ArtistGrid.tsx`**

Features:
- Live search input.
- Sort dropdown: Name (A-Z), Name (Z-A), Most Albums, Most Tracks.
- Card items with:
  - Circular avatar with `/api/artists/:id/photo`.
  - Band logo overlay if available (`/api/artists/:id/logo`).
  - Artist Name, Albums count, Tracks count.
  - Play Discography button on hover.
  - Clicking card calls `selectArtist(artist.id, artist.name)`.

- [ ] **Step 2: Integrate into `App.tsx`**

When `activeSection === 'artists'`, if no `selectedArtistId`, render `<ArtistGrid />`.

---

### Task 6: Frontend Artist Detail View & Discography Grouping

**Files:**
- Create: `client/src/components/ArtistDetailView.tsx`
- Modify: `client/src/App.tsx`

- [ ] **Step 1: Create `ArtistDetailView.tsx`**

Features:
- Back button to return to Artist Grid (`selectArtist(null)`).
- Hero banner with dark ambient blurred background from artist photo.
- Prominent Band Logo rendered cleanly on the banner.
- Artist Name, Bio snippet (expandable), stats, "Play Discography", "Shuffle", "Refetch Art" buttons.
- Chronological Discography listing:
  - Album card / header with cover, title, year, format, and track table.

- [ ] **Step 2: Integrate into `App.tsx`**

When `activeSection === 'artists'` and `selectedArtistId !== null`, render `<ArtistDetailView />`.

---

### Task 7: Settings Modal Integrations Tab Enhancements

**Files:**
- Modify: `client/src/components/SettingsModal.tsx`

- [ ] **Step 1: Add Discogs Status & Batch Fetching in Integrations Tab**

- Discogs API Consumer Key & Secret display with "Active" badge.
- Artist Artwork status card:
  - Progress bar showing cached artist count / total artists.
  - "Start Background Artwork Fetch (Throttled)" button.
  - Live indicator showing which artist is currently being fetched.

---

### Task 8: Build, Verify and Test

- [ ] **Step 1: Run client & server builds**
Run `npm run build:client` and `npm run build:server`.
Verify zero TypeScript / Vite compilation errors.

- [ ] **Step 2: Test live artist fetching on sample bands**
Fetch art for sample bands in GORE (e.g. `Butcher ABC`, `Vomitoma`, `Spermswamp`).
Verify photos and logos render cleanly in Artist Grid and Artist Detail View.

- [ ] **Step 3: End-to-end user verification**
Confirm all UI elements match the dark-metal audiophile aesthetic.
