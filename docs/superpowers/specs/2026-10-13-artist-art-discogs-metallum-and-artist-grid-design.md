# Artist Artwork Engine & Artist Grouping Grid Design Specification

**Date:** 2026-10-13  
**Status:** Approved  
**Author:** Antigravity AI & angki_ang  

---

## 1. Executive Summary

Black Library's library includes extensive metal, goregrind, and miscellaneous genre collections (such as the 45,338-track GORE collection). While albums currently have cover art and album grids, artists lack visual identity, logos, and a dedicated grouping grid. 

This specification defines:
1. **Multi-Source Artist Artwork Engine (Cascade)**:
   - **Tier 1 (Local Disk)**: Detects local artist artwork/logos (`artist.jpg`, `folder.jpg`, `logo.png`, `band.jpg`) in the artist directory or MusicBee cache.
   - **Tier 2 (Encyclopaedia Metallum / Metal Archives)**: Scrapes high-resolution transparent band logos (PNG) and band photos (JPG) for metal/grind artists with rate-limiting and user-agent rotation.
   - **Tier 3 (Discogs API)**: Uses authenticated official Discogs REST API (Consumer Key: `laXMILyXwnDtTqazBNJg`, Consumer Secret: `JYyLsjmiqolHngZbrLXVGGzlUcOmHGZM`) for universal genre coverage to fetch artist photos and profiles.
2. **Local Server Caching**:
   - Stores downloaded assets at `server/data/artists/<artistId>_photo.jpg` and `<artistId>_logo.png`.
   - Serves images via Fastify endpoints with SVG initial-avatar fallback.
3. **Artist Grid & Grouping UI**:
   - Dedicated **Artists** view in the sidebar rendering an interactive grid of artist cards (avatar/logo, album count, track count).
   - Rich **Artist Discography View** with hero photo banner, band logo, bio, chronological album rows, and quick-play actions.
   - Background fetch queue controls in **Settings > Integrations** with live progress indicators.

---

## 2. Architecture & Data Model

### 2.1 Database Schema Changes (`server/prisma/schema.prisma`)

Add artwork tracking fields to the `Artist` model:

```prisma
model Artist {
  id             String    @id @default(uuid())
  name           String    @unique
  normalizedName String
  bio            String?
  photoPath      String?   // Relative or absolute path to cached photo (e.g. data/artists/<id>_photo.jpg)
  logoPath       String?   // Relative or absolute path to cached logo (e.g. data/artists/<id>_logo.png)
  discogsId      Int?      // Official Discogs Artist ID
  metallumId     String?   // Metal-Archives band ID/URL path
  artFetchedAt   DateTime? // Last attempt timestamp
  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt

  tracks         Track[]
  albums         Album[]
}
```

Migrations will be generated via `npx prisma db push` or Prisma migration.

### 2.2 System Architecture Diagram

```mermaid
graph TD
    Client[Web Client / Desktop PWA] -->|Requests /api/artists| API[Fastify Backend]
    Client -->|Loads /api/artists/:id/photo| PhotoRoute[Photo Stream Handler]
    Client -->|Loads /api/artists/:id/logo| LogoRoute[Logo Stream Handler]
    
    API --> Service[artistArtService.ts]
    Service --> LocalDisk[1. Local Folder Check]
    Service --> Metallum[2. Metal Archives Scraper (Throttled 1.5s)]
    Service --> Discogs[3. Discogs REST API (Key + Secret)]
    
    Service --> Storage[(server/data/artists/)]
    Service --> DB[(SQLite Prisma Artist)]
```

---

## 3. Backend Implementation

### 3.1 Discogs API Client (`server/src/artists/discogsClient.ts`)

- **Authentication**:
  - Request header: `Authorization: Discogs key=laXMILyXwnDtTqazBNJg, secret=JYyLsjmiqolHngZbrLXVGGzlUcOmHGZM`
  - User-Agent: `BlackLibrary/1.0 (+https://github.com/blacklibrary)`
- **Search Endpoint**:
  - `GET https://api.discogs.com/database/search?q={encodeURIComponent(artistName)}&type=artist`
  - Selects closest match by normalized string comparison.
- **Details Endpoint**:
  - `GET https://api.discogs.com/artists/{id}`
  - Retrieves `images` array (picks `type === "primary"` or first available `uri`).
  - Retrieves `profile` (sanitized bio).
- **Download Handler**:
  - Streams image directly to `server/data/artists/{artistId}_photo.jpg`.

### 3.2 Encyclopaedia Metallum Scraper (`server/src/artists/metallumScraper.ts`)

- **Search Endpoint**:
  - `GET https://www.metal-archives.com/search/ajax-band-search/?field=name&query={encodeURIComponent(artistName)}`
  - Parses JSON array `aaData` which contains links of format `<a href="https://www.metal-archives.com/bands/{name}/{bandId}">...</a>`.
- **Band Page Scraping**:
  - `GET https://www.metal-archives.com/bands/{name}/{bandId}`
  - Cheerio/Regex parsing:
    - Logo URL: anchor `#logo` with `href` pointing to image URL.
    - Photo URL: anchor `#photo` with `href` pointing to image URL.
- **Rate-Limiter**:
  - Enforces minimum 1,500ms delay between consecutive requests to prevent Cloudflare HTTP 429/403.
  - Realistic desktop browser User-Agent headers.

### 3.3 Local Artwork Finder (`server/src/artists/localArtFinder.ts`)

- Resolves the first track of the artist to locate the artist's root folder:
  - If track path is `D:/Music/GORE/Butcher ABC/[2017] North Of Hell/01.mp3`, the artist folder is `D:/Music/GORE/Butcher ABC`.
- Checks for file existence (case-insensitive):
  - Photos: `artist.jpg`, `artist.png`, `band.jpg`, `band.png`, `folder.jpg`.
  - Logos: `logo.png`, `logo.jpg`, `band_logo.png`.
- If found, copies or links directly to `server/data/artists/`.

### 3.4 API Endpoints (`server/src/routes/artists.ts`)

- `GET /api/artists`: Returns array of artists with `id`, `name`, `albumCount`, `trackCount`, `hasPhoto`, `hasLogo`.
- `GET /api/artists/:id`: Detailed artist info including bio, albums grouped by year, top tracks.
- `GET /api/artists/:id/photo`: Streams cached photo, or renders dynamic SVG with artist initials and gradient background.
- `GET /api/artists/:id/logo`: Streams cached logo PNG/JPG, or 404 if no logo exists.
- `POST /api/artists/:id/fetch-art`: Triggers immediate cascade fetch for a single artist.
- `POST /api/artists/batch-fetch`: Starts/pauses background queue for un-fetched artists.
- `GET /api/artists/batch-status`: Returns count of processed vs total artists and current active worker state.

---

## 4. Frontend UI Implementation

### 4.1 Artist Grid View (`client/src/components/ArtistGrid.tsx`)

- Activated when `activeSection === 'artists'` in `useUiStore`.
- **Top Bar**:
  - Live search input filter (`Search artists...`).
  - Sort dropdown: *Name (A-Z)*, *Name (Z-A)*, *Most Albums*, *Most Tracks*.
  - View toggle: Grid Cards or Compact List.
- **Artist Card**:
  - Circular avatar or square card with artist photo.
  - Overlay band logo if available (transparent PNG).
  - Bold artist title with hover underline.
  - Subtitle: `N Albums • M Tracks`.
  - Quick action: Floating play button on hover to play all artist tracks sequentially.
  - Clicking card selects artist (`selectArtist(artist.id, artist.name)`).

### 4.2 Artist Discography View (`client/src/components/ArtistDetailView.tsx`)

- When an artist is selected (`selectedArtistId !== null`):
  - **Hero Header**:
    - High-resolution artist photo with dark gradient vignette and ambient blur.
    - Band logo prominently rendered.
    - Artist name, genre chips, total duration, and play count stats.
    - "Play Discography", "Shuffle Artist", and "Refetch Artwork" buttons.
  - **Bio Section**: Expandable artist profile text from Discogs/Metallum.
  - **Discography Rows**:
    - Chronologically sorted albums with release year, cover art, track list table, and hi-res audio quality badges.

### 4.3 Settings & Background Fetch Manager (`client/src/components/SettingsModal.tsx`)

- Under **Integrations Tab**:
  - **Discogs Integration**: Display configured Consumer Key & Secret, Connection Test button (`Connected to Discogs`).
  - **Artist Artwork Fetcher**:
    - Summary badge: `X / Total Artists with Artwork`.
    - Button: `Start Background Artwork Fetch` (with progress bar, current artist being fetched, and Pause button).

---

## 5. Error Handling & Edge Cases

1. **Rate Limits & API Outages**:
   - Metallum 429: Automatically backs off by 5 seconds and skips to next source or defers item in queue.
   - Discogs 429: Inspects `X-Discogs-Ratelimit-Remaining` header.
2. **Missing Artwork**:
   - If neither Metallum nor Discogs has an image, `artFetchedAt` is still recorded so the background worker does not repeatedly query missing artists.
   - Dynamic dark-glass initial avatar SVG is served with 200 OK.
3. **Multiple Bands with Identical Names**:
   - Scraper compares album titles or genres from library against Discogs/Metallum discography to pick the best match index.
4. **Tailscale & Remote Performance**:
   - Resized/compressed thumbnails are cached; client queries cached images via standard HTTP cache headers (`Cache-Control: public, max-age=86400`).

---

## 6. Verification & Test Plan

1. **Unit & Script Tests**:
   - Test Discogs API client with key/secret on sample bands (e.g. "Vomitoma", "Butcher ABC", "Darkthrone").
   - Test Metallum scraper on sample death/black metal bands and verify logo extraction.
   - Test local file fallback on `D:/Music/GORE`.
2. **API Endpoint Verification**:
   - Test `GET /api/artists/:id/photo` and `GET /api/artists/:id/logo`.
   - Test batch status reporting.
3. **UI Verification**:
   - Navigate to sidebar "Artists" -> confirm `ArtistGrid` loads cards with photos and logos.
   - Click an artist -> verify discography grouping and hero banner.
   - Check Settings > Integrations -> verify Discogs status and batch fetch controls.
4. **Build & Bundle Validation**:
   - Run `npm run build:client` and `npm run build:server` with zero TypeScript or bundling errors.
