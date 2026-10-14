# Black Library: Lyrics Engine, Smart Playlists & Similar Artists Design Specification

**Date:** 2026-10-14  
**Status:** Approved  
**Author:** AI Assistant & angki  

---

## 1. Overview & Objectives

This specification details three interconnected, high-impact features for the **Black Library** music streaming system:
1. **Synchronized & Plain Lyrics Engine**: Reads local `.lrc`/`.txt` sidecar files, extracted embedded metadata tags (`USLT`/`lyrics`), and falls back to online retrieval (LRCLIB & Metal Archives) with local disk caching. Rendered as a dedicated, smoothly scrolling synchronized tab in the Right Panel.
2. **Smart Auto-Playlists**: Five dynamic, rule-based playlists in the Left Sidebar that query library statistics and metadata on-the-fly without manual curation:
   - 🔥 *Top 100 Most Played*
   - 🕒 *Recently Added (Last 30 Days)*
   - 💎 *Pure Lossless Vault (FLAC/WAV)*
   - ⏳ *Epic Length (> 10 Min)*
   - 🕯️ *Forgotten Relics (0 Play Count)*
3. **Similar Artists Discovery**: In the `ArtistDetailView`, displays a curated row of musically similar bands sourced from Encyclopaedia Metallum and Last.fm, cross-matched against the local library to highlight bands already available on disk with instant navigation.

---

## 2. Architecture & Components

```
┌────────────────────────────────────────────────────────┐
│                   Web Client (React)                   │
├────────────────────┬─────────────────┬─────────────────┤
│ Right Panel Lyrics │ Left Sidebar    │ Artist Detail   │
│ Tab (Synced Scroll)│ Smart Playlists │ Similar Bands   │
└─────────▲──────────┴────────▲────────┴────────▲────────┘
          │                   │                 │
          │                   │                 │
┌─────────▼───────────────────▼─────────────────▼────────┐
│                   Fastify Backend                      │
├────────────────────┬─────────────────┬─────────────────┤
│ /api/tracks/:id/   │ /api/smart-     │ /api/artists/   │
│ lyrics             │ playlists       │ :id/similar     │
└─────────▲──────────┴────────▲────────┴────────▲────────┘
          │                   │                 │
┌─────────▼──────────┐ ┌──────▼────────┐ ┌──────▼────────┐
│  Lyrics Engine     │ │ Prisma/SQLite │ │ Similar Bands │
│  - .lrc file check │ │ Dynamic SQL   │ │ Resolver      │
│  - Tag extract     │ │ Aggregates    │ │ - Metallum    │
│  - LRCLIB fallback │ └───────────────┘ │ - Last.fm     │
│  - Disk Cache      │                   │ - DB Match    │
└────────────────────┘                   └───────────────┘
```

---

## 3. Component 1: Lyrics Engine

### 3.1 Sources & Cascade Priority
1. **Local Sidecar File**:
   Checks track parent directory for:
   - `<TrackFilenameWithoutExt>.lrc`
   - `<TrackFilenameWithoutExt>.txt`
   - `<TrackFilenameWithExt>.lrc`
2. **Embedded Metadata Tags**:
   Reads audio metadata via `music-metadata`:
   - `common.lyrics` (Vorbis / FLAC)
   - ID3v2 `USLT` frame
3. **Online Fallback & Auto-Cache**:
   - Queries `https://lrclib.net/api/get?artist_name=...&track_name=...&album_name=...&duration=...` (free, open, high precision LRC database).
   - If found, saves downloaded lyrics to `server/data/lyrics/${trackId}.lrc`.
   - Subsequent calls stream directly from local disk cache (zero remote latency, offline & Tailscale safe).

### 3.2 Parser & API Contract
`GET /api/tracks/:id/lyrics`

**Response:**
```json
{
  "source": "sidecar" | "embedded" | "cached" | "online" | "none",
  "hasSyncedLyrics": true,
  "lines": [
    { "time": 12.45, "text": "In the depths of winter..." },
    { "time": 15.80, "text": "Cold black shadows rise..." }
  ],
  "plainLyrics": "In the depths of winter...\nCold black shadows rise..."
}
```

### 3.3 UI Interaction (RightPanel.tsx)
- Right panel tabs: `[ Antrean ]` `[ Riwayat ]` `[ Lirik ]`.
- Active line highlight: Matches current `currentTime` from `playerStore`.
- Auto-scroll: Smoothly centers the currently active line in the lyrics container.
- Seek-on-click: Clicking any line calls `seek(line.time)`.
- Fallback UI: If plain text, renders clean, typography-focused stanza view; if no lyrics found, displays atmospheric empty state with "Cari Lirik Online" trigger button.

---

## 4. Component 2: Smart Auto-Playlists

### 4.1 Preset Definitions & Queries
All presets are queried dynamically via SQLite without manual sync:

1. **`top-played` (Heavy Rotation)**:
   ```sql
   SELECT t.*, (COALESCE(us.playCount, 0) + COALESCE(t.importedPlayCount, 0)) as combinedCount
   FROM Track t
   LEFT JOIN UserTrackStat us ON t.id = us.trackId
   WHERE t.isUnavailable = 0 AND combinedCount > 0
   ORDER BY combinedCount DESC
   LIMIT 100
   ```
2. **`recently-added` (New Discoveries)**:
   ```sql
   SELECT t.* FROM Track t
   WHERE t.isUnavailable = 0 AND t.createdAt >= datetime('now', '-30 days')
   ORDER BY t.createdAt DESC
   LIMIT 100
   ```
3. **`lossless-vault` (Audiophile Quality)**:
   ```sql
   SELECT t.* FROM Track t
   WHERE t.isUnavailable = 0 AND t.isLossless = 1
   ORDER BY RANDOM()
   LIMIT 150
   ```
4. **`epic-length` (Dungeon Synth & Atmo Black)**:
   ```sql
   SELECT t.* FROM Track t
   WHERE t.isUnavailable = 0 AND t.duration >= 600
   ORDER BY t.duration DESC
   LIMIT 100
   ```
5. **`forgotten-relics` (Unplayed Gems)**:
   ```sql
   SELECT t.* FROM Track t
   LEFT JOIN UserTrackStat us ON t.id = us.trackId
   WHERE t.isUnavailable = 0 
     AND COALESCE(us.playCount, 0) = 0 
     AND COALESCE(t.importedPlayCount, 0) = 0
   ORDER BY RANDOM()
   LIMIT 100
   ```

### 4.2 API Contract
- `GET /api/smart-playlists`: Returns list of 5 presets with track counts, description, and icons.
- `GET /api/smart-playlists/:key`: Returns `{ preset: {...}, tracks: Track[] }`.

### 4.3 UI Interaction (LeftSidebar.tsx & Main View)
- In `LeftSidebar.tsx`, under Playlists: Dedicated section *"Smart Playlists"* with distinctive icons (🔥, 🕒, 💎, ⏳, 🕯️).
- Clicking a smart playlist sets `activeSection = 'smart-playlist'` and loads `currentSmartPlaylistKey`.
- Main view renders `TrackTable` with custom header banner showing total duration, track count, and instant "Play All" / "Shuffle".

---

## 5. Component 3: Similar Artists Engine

### 5.1 Sources & Resolution
1. **Metal Archives Similar Artists Scraper**:
   Scrapes `https://www.metal-archives.com/band/ajax-recommendations/id/${metallumId}/showMore/1` to get top recommended bands and user upvotes.
2. **Last.fm Fallback**:
   Uses `artist.getSimilar` method via Last.fm API.
3. **Local Library Cross-Matching**:
   Queries local database `prisma.artist.findFirst({ where: { name: similarName } })`:
   - If found: `{ name, score, inLibrary: true, id: localArtist.id, albumCount, trackCount }`
   - If not found: `{ name, score, inLibrary: false }`
4. **Caching**:
   Stores result in SQLite `Artist.similarArtists` JSON string column to ensure instantaneous loads after first retrieval.

### 5.2 API Contract
`GET /api/artists/:id/similar`

**Response:**
```json
{
  "artistId": "uuid",
  "similar": [
    {
      "name": "Disgorge",
      "score": 42,
      "inLibrary": true,
      "libraryArtistId": "uuid-disgorge",
      "trackCount": 38,
      "albumCount": 3
    },
    {
      "name": "Regurgitate",
      "score": 35,
      "inLibrary": false
    }
  ]
}
```

### 5.3 UI Interaction (ArtistDetailView.tsx)
- Placed immediately beneath the Artist Bio and above the chronological album list.
- Horizontal scrollable pill/card row.
- **In Library Bands**: Glowing subtle crimson/emerald badge with `trackCount` indicator. Clicking navigates instantly to `selectArtist(item.libraryArtistId)`.
- **External Bands**: Clean muted badge with external music discovery indicator.

---

## 6. Testing & Quality Assurance
1. **Lyrics Engine Tests**:
   - Verify parsing of timestamp formats: `[mm:ss.xx]`, `[mm:ss.xxx]`, and multi-timestamp lines.
   - Verify fallback when online API is unavailable or song has no lyrics.
   - Verify disk caching prevents duplicate network requests.
2. **Smart Playlists Tests**:
   - Verify SQL queries execute within < 50ms across large libraries (> 10,000 tracks).
   - Verify "Play All" and "Shuffle" correctly populate player queue.
3. **Similar Artists Tests**:
   - Verify casing and punctuation tolerance when matching band names against local DB (e.g. "Butcher ABC" vs "Butcher A.B.C.").
4. **Build & Bundling**:
   - Full `npm run build` client + server check with zero TypeScript/Vite errors.
