# Playback Queue Continuity & Navigation Enhancements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ensure seamless background audio playback across the entire queue without being interrupted by browser autoplay throttling, provide a horizontal alphabetical (A-Z) jump bar for table and grid views, and add collection-level Shuffle All functionality with optimized backend sampling.

**Architecture:** 
1. `PlayerBar.tsx` will chain upcoming tracks synchronously inside the native `onended` event callback and continuously update `MediaSession.setPositionState` to maintain uninterrupted background playback privileges.
2. `server/src/routes/tracks.ts` will support `sortBy: 'random'` with SQLite `ORDER BY RANDOM()` for instant sampling of large collections without heavy memory overhead.
3. A new `AlphabetBar.tsx` component will render above `TrackTable` and `AlbumGrid` to jump directly to target letter indices via `@tanstack/react-virtual`.
4. `LeftSidebar.tsx` and `TopToolbar.tsx` will provide one-click "Shuffle Collection" buttons that query the random endpoint and populate the queue immediately.

**Tech Stack:** React 19, TypeScript, Zustand, `@tanstack/react-virtual`, Fastify, Prisma (SQLite), HTML5 Audio & MediaSession API.

---

### Task 1: Backend Fast Random/Shuffle Tracks Query Support

**Files:**
- Modify: `server/src/routes/tracks.ts:153-186`
- Test: `server/scripts/test_random_tracks.ts`

- [ ] **Step 1: Implement `sortBy === 'random'` in `server/src/routes/tracks.ts`**

When `query.sortBy === 'random'` or `query.shuffle === 'true'`:
In SQLite, querying with `ORDER BY RANDOM()` using Prisma raw query or random offset sampling for the requested `where` clause:

```typescript
    if (sortField === 'random' || (query as any).shuffle === 'true') {
      // Use raw query for true high-speed SQLite RANDOM() selection
      const whereConditions: string[] = ['t.isUnavailable = 0'];
      const params: any[] = [];

      if (query.rootId) {
        whereConditions.push('t.rootId = ?');
        params.push(query.rootId);
      }
      if (query.artistId) {
        whereConditions.push('t.artistId = ?');
        params.push(query.artistId);
      }
      if (query.albumId) {
        whereConditions.push('t.albumId = ?');
        params.push(query.albumId);
      }

      const whereSql = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';
      const limitVal = Math.min(limit, 500);

      const randomRows = await prisma.$queryRawUnsafe<any[]>(
        `SELECT t.*, r.name as collectionName 
         FROM Track t 
         LEFT JOIN LibraryRoot r ON t.rootId = r.id 
         ${whereSql} 
         ORDER BY RANDOM() 
         LIMIT ${limitVal}`,
        ...params
      );

      const formatted = randomRows.map(t => ({
        id: t.id,
        rootId: t.rootId,
        collectionName: t.collectionName || 'Library',
        relativePath: t.relativePath,
        filename: t.filename,
        extension: t.extension,
        fileSize: Number(t.fileSize),
        title: t.title,
        trackNumber: t.trackNumber,
        discNumber: t.discNumber,
        duration: t.duration,
        year: t.year,
        genre: t.genre,
        codec: t.codec,
        bitrate: t.bitrate,
        sampleRate: t.sampleRate,
        bitDepth: t.bitDepth,
        channels: t.channels,
        isLossless: Boolean(t.isLossless),
        artistId: t.artistId,
        artistName: t.artistName,
        albumId: t.albumId,
        albumTitle: t.albumTitle,
        albumArtist: t.albumArtist,
        folderArtist: t.folderArtist,
        folderAlbum: t.folderAlbum,
        folderPath: t.folderPath,
        artworkId: t.artworkId,
        isFavorite: false,
        rating: null,
        localPlayCount: 0,
        importedPlayCount: t.importedPlayCount || 0,
        combinedPlayCount: t.importedPlayCount || 0,
        lastPlayed: null,
        dateAdded: t.createdAt ? new Date(t.createdAt).toISOString() : new Date().toISOString(),
      }));

      return {
        total: formatted.length,
        page: 1,
        limit: limitVal,
        tracks: formatted,
      };
    }
```

- [ ] **Step 2: Test random tracks route with a test script**

Create `server/scripts/test_random_tracks.ts`:
```typescript
import { prisma } from '../src/db.js';

async function main() {
  const root = await prisma.libraryRoot.findFirst();
  console.log('Testing random query for root:', root?.name);
  const rows = await prisma.$queryRawUnsafe<any[]>(
    `SELECT id, title, artistName, albumTitle FROM Track ${root ? 'WHERE rootId = ?' : ''} ORDER BY RANDOM() LIMIT 5`,
    ...(root ? [root.id] : [])
  );
  console.log('Random sample:', rows);
}
main().finally(() => prisma.$disconnect());
```

Run: `npx tsx scripts/test_random_tracks.ts`
Expected: Successfully logs 5 random tracks. Remove temporary script.

- [ ] **Step 3: Build server and verify endpoint**

Run: `npm run build:server`
Run: `curl.exe -s "http://127.0.0.1:3000/api/tracks?sortBy=random&limit=3"`
Expected: Returns 3 randomly sampled tracks with `200 OK`.

- [ ] **Step 4: Commit**

```bash
git add server/src/routes/tracks.ts
git commit -m "feat(api): add fast SQLite ORDER BY RANDOM() support to tracks endpoint"
```

---

### Task 2: Seamless Background Playback Chaining & MediaSession Keep-Alive

**Files:**
- Modify: `client/src/components/PlayerBar.tsx:160-375`
- Modify: `client/src/store/playerStore.ts:144-178`

- [ ] **Step 1: Add synchronous track advance in `PlayerBar.tsx` `handleEnded`**

In `PlayerBar.tsx`:
```typescript
  const handleEnded = () => {
    const audio = audioRef.current;
    const currentSessionId = usePlayerStore.getState().sessionId;
    const currentListened = usePlayerStore.getState().listenedSeconds;

    if (currentTrack && currentSessionId) {
      api.reportProgress({
        trackId: currentTrack.id,
        sessionId: currentSessionId,
        listenedSeconds: currentListened,
        eventId: crypto.randomUUID(),
      }).catch(e => console.warn('Final progress report failed:', e));
    }

    if (repeatMode === 'one') {
      if (audio) {
        audio.currentTime = 0;
        audio.play().catch(e => console.warn('Repeat play failed:', e));
      }
      return;
    }

    const { queue, queueIndex, isShuffle, repeatMode: rMode } = usePlayerStore.getState();
    if (queue.length === 0) return;

    let nextIndex = queueIndex + 1;
    if (isShuffle) {
      nextIndex = Math.floor(Math.random() * queue.length);
    } else if (nextIndex >= queue.length) {
      if (rMode === 'all') {
        nextIndex = 0;
      } else {
        usePlayerStore.setState({ isPlaying: false });
        if ('mediaSession' in navigator) {
          navigator.mediaSession.playbackState = 'none';
        }
        return;
      }
    }

    const nextTrack = queue[nextIndex];
    if (nextTrack && audio) {
      // 1. Synchronously set audio.src and start playback immediately
      // This retains the browser's background playback gesture privilege.
      lastTrackIdRef.current = nextTrack.id;
      lastTimeRef.current = 0;
      listenedSinceLastReportRef.current = 0;
      resetListenedSeconds();

      const streamUrl = api.getStreamUrl(nextTrack.id, forceTranscode);
      audio.src = streamUrl;
      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise.catch((err) => {
          if (err.name !== 'AbortError') {
            console.warn('Background auto-advance play error:', err);
          }
        });
      }

      // 2. Synchronously update MediaSession metadata
      if ('mediaSession' in navigator) {
        const artworkUrl = api.getTrackArtworkUrl(nextTrack.id, 512);
        navigator.mediaSession.metadata = new MediaMetadata({
          title: nextTrack.title,
          artist: nextTrack.artistName,
          album: nextTrack.albumTitle || 'Unknown Album',
          artwork: [
            { src: artworkUrl, sizes: '512x512', type: 'image/webp' },
            { src: artworkUrl, sizes: '256x256', type: 'image/webp' },
          ],
        });
        navigator.mediaSession.playbackState = 'playing';
      }

      // 3. Update Zustand store
      usePlayerStore.setState({
        queueIndex: nextIndex,
        currentTrack: nextTrack,
        isPlaying: true,
        currentTime: 0,
        duration: nextTrack.duration,
        sessionId: null,
        listenedSeconds: 0,
      });

      // 4. Start backend playback tracking session
      api.startPlayback(nextTrack.id).then((res) => {
        setSessionId(res.sessionId);
      }).catch(err => console.error('Failed to start playback session:', err));
    }
  };
```

- [ ] **Step 2: Add `navigator.mediaSession.setPositionState` during playback**

In `handleTimeUpdate`:
```typescript
    if ('mediaSession' in navigator && 'setPositionState' in navigator.mediaSession) {
      const effDuration = audio.duration || currentTrack.duration;
      if (effDuration && isFinite(effDuration) && effDuration > 0) {
        try {
          navigator.mediaSession.setPositionState({
            duration: effDuration,
            playbackRate: audio.playbackRate || 1,
            position: Math.min(Math.max(0, cur), effDuration),
          });
        } catch {
          // ignore position state timing discrepancies
        }
      }
    }
```

- [ ] **Step 3: Handle resilient `audio.onError` auto-skip**

In `<audio onError={...}>`:
```typescript
        onError={(e) => {
          console.warn('Audio element error:', e);
          if (!forceTranscode && currentTrack) {
            console.log('Direct playback failed, switching to transcode fallback...');
            setForceTranscode(true);
          } else {
            console.warn('Track unplayable, auto-advancing to next track in queue...');
            setTimeout(() => {
              handleEnded();
            }, 1000);
          }
        }}
```

- [ ] **Step 4: Build client and verify audio event handling**

Run: `npm run build:client`
Expected: Clean build without errors.

- [ ] **Step 5: Commit**

```bash
git add client/src/components/PlayerBar.tsx
git commit -m "fix(player): implement synchronous continuous queue chaining and MediaSession keep-alive"
```

---

### Task 3: Alphabetical Horizontal Mini-Scroller Component (`AlphabetBar.tsx`)

**Files:**
- Create: `client/src/components/AlphabetBar.tsx`
- Modify: `client/src/App.tsx:160-175`
- Modify: `client/src/components/TrackTable.tsx`
- Modify: `client/src/components/AlbumGrid.tsx`

- [ ] **Step 1: Create `client/src/components/AlphabetBar.tsx`**

Features:
- Character list: `['#', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z']`.
- Props:
  - `activeLetters`: `Set<string>` (letters that have at least 1 track/album in current view).
  - `onSelectLetter`: `(letter: string) => void`.
  - `selectedLetter`: `string | null`.
- Clean horizontal bar with compact pills/buttons, hover feedback, active state indicator.

```tsx
import React from 'react';

interface AlphabetBarProps {
  activeLetters: Set<string>;
  selectedLetter: string | null;
  onSelectLetter: (letter: string) => void;
}

const ALPHABET = ['#', ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')];

export const AlphabetBar: React.FC<AlphabetBarProps> = ({
  activeLetters,
  selectedLetter,
  onSelectLetter,
}) => {
  return (
    <div className="h-7 bg-charcoal-900/90 border-b border-charcoal-800 px-2 flex items-center justify-between overflow-x-auto no-scrollbar select-none text-[10.5px] font-mono shrink-0">
      <div className="flex items-center space-x-0.5 min-w-max mx-auto">
        {ALPHABET.map((char) => {
          const isAvailable = activeLetters.has(char);
          const isSelected = selectedLetter === char;

          return (
            <button
              key={char}
              disabled={!isAvailable}
              onClick={() => onSelectLetter(char)}
              title={isAvailable ? `Jump to ${char}` : `No items starting with ${char}`}
              className={`w-5 h-5 flex items-center justify-center rounded transition font-medium ${
                isSelected
                  ? 'bg-crimson-700 text-white font-bold shadow-xs'
                  : isAvailable
                  ? 'text-zinc-300 hover:text-white hover:bg-charcoal-750 cursor-pointer'
                  : 'text-zinc-650 cursor-default opacity-40'
              }`}
            >
              {char}
            </button>
          );
        })}
      </div>
    </div>
  );
};
```

- [ ] **Step 2: Connect `AlphabetBar` in `TrackTable.tsx` and `AlbumGrid.tsx`**

In `TrackTable.tsx`:
- Compute `activeLetters` by checking first letter of track artist or title:
```typescript
  const { availableLetters, letterIndexMap } = useMemo(() => {
    const letters = new Set<string>();
    const map = new Map<string, number>();

    tracks.forEach((track, idx) => {
      const fieldVal = sortBy === 'title' ? track.title : track.artistName;
      const firstChar = (fieldVal || '').trim().charAt(0).toUpperCase();
      const char = /[A-Z]/.test(firstChar) ? firstChar : '#';

      letters.add(char);
      if (!map.has(char)) {
        map.set(char, idx);
      }
    });

    return { availableLetters: letters, letterIndexMap: map };
  }, [tracks, sortBy]);
```
- On click letter:
```typescript
  const handleJumpToLetter = (char: string) => {
    const targetIdx = letterIndexMap.get(char);
    if (targetIdx !== undefined && virtualizer) {
      virtualizer.scrollToIndex(targetIdx, { align: 'start' });
    }
  };
```
- Render `<AlphabetBar />` at top of `TrackTable` and `AlbumGrid` when `sortBy === 'artistName'` or `sortBy === 'title'` or `sortBy === 'albumTitle'`.

- [ ] **Step 3: Connect `AlphabetBar` in `AlbumGrid.tsx`**

- In `AlbumGrid.tsx`, compute `activeLetters` from `albums`:
```typescript
  const { availableLetters, letterRowMap } = useMemo(() => {
    const letters = new Set<string>();
    const map = new Map<string, number>();

    albums.forEach((album, idx) => {
      const fieldVal = albumSortBy === 'artistName' ? album.artistName : album.title;
      const firstChar = (fieldVal || '').trim().charAt(0).toUpperCase();
      const char = /[A-Z]/.test(firstChar) ? firstChar : '#';

      letters.add(char);
      if (!map.has(char)) {
        const rowIndex = Math.floor(idx / columnCount);
        map.set(char, rowIndex);
      }
    });

    return { availableLetters: letters, letterRowMap: map };
  }, [albums, albumSortBy, columnCount]);
```
- On click: `rowVirtualizer.scrollToIndex(rowIndex, { align: 'start' })`.

- [ ] **Step 4: Build client and verify rendering**

Run: `npm run build:client`
Expected: Build succeeds with 0 errors.

- [ ] **Step 5: Commit**

```bash
git add client/src/components/AlphabetBar.tsx client/src/components/TrackTable.tsx client/src/components/AlbumGrid.tsx
git commit -m "feat(ui): add horizontal A-Z alphabetical jump bar for TrackTable and AlbumGrid"
```

---

### Task 4: Collection-Level "Shuffle All" in LeftSidebar & TopToolbar

**Files:**
- Modify: `client/src/components/LeftSidebar.tsx:140-185`
- Modify: `client/src/components/TopToolbar.tsx:190-240`

- [ ] **Step 1: Add Shuffle button to collection items in `LeftSidebar.tsx`**

In `LeftSidebar.tsx`:
```tsx
  const handleShuffleCollection = (e: React.MouseEvent, rootId?: string) => {
    e.stopPropagation();
    api.getTracks({
      rootId,
      sortBy: 'random',
      limit: 250,
    }).then((res) => {
      if (res.tracks.length > 0) {
        usePlayerStore.getState().playTrack(res.tracks[0], res.tracks);
        usePlayerStore.setState({ isShuffle: true });
      }
    }).catch((err) => console.error('Failed to shuffle collection:', err));
  };
```

Render shuffle icon button on each row in `LeftSidebar.tsx`:
```tsx
  <button
    onClick={(e) => handleShuffleCollection(e, root.id)}
    title={`Shuffle ${root.name}`}
    className="opacity-0 group-hover:opacity-100 p-1 hover:text-crimson-400 rounded transition"
  >
    <Shuffle size={11} />
  </button>
```

And on "All Collections":
```tsx
  <button
    onClick={(e) => handleShuffleCollection(e)}
    title="Shuffle All Collections"
    className="opacity-0 group-hover:opacity-100 p-1 hover:text-crimson-400 rounded transition"
  >
    <Shuffle size={11} />
  </button>
```

- [ ] **Step 2: Add "Shuffle Library" button to `TopToolbar.tsx`**

In `TopToolbar.tsx`:
```tsx
  <button
    onClick={() => {
      api.getTracks({
        rootId: selectedRootId || undefined,
        sortBy: 'random',
        limit: 250,
      }).then((res) => {
        if (res.tracks.length > 0) {
          usePlayerStore.getState().playTrack(res.tracks[0], res.tracks);
          usePlayerStore.setState({ isShuffle: true });
        }
      });
    }}
    title={selectedRootName ? `Shuffle ${selectedRootName}` : 'Shuffle Library'}
    className="flex items-center space-x-1 bg-charcoal-800 hover:bg-charcoal-750 text-zinc-300 px-2 py-1 rounded border border-charcoal-700 transition"
  >
    <Shuffle size={11} className="text-crimson-400" />
    <span className="hidden sm:inline">Shuffle</span>
  </button>
```

- [ ] **Step 3: Build client & server, copy client build to server**

Run: `npm run build`
Expected:
`client` build succeeds, assets copied to `server/public`, `server` build succeeds.

- [ ] **Step 4: Commit**

```bash
git add client/src/components/LeftSidebar.tsx client/src/components/TopToolbar.tsx
git commit -m "feat(ui): add collection-level Shuffle All buttons to LeftSidebar and TopToolbar"
```

---

### Task 5: End-to-End Verification

**Files:**
- Test scripts and browser verification

- [ ] **Step 1: Restart server with updated build**
- [ ] **Step 2: Test API random shuffle endpoint with `curl.exe`**
- [ ] **Step 3: Test continuous audio playback & MediaSession metadata via Playwright / browser test**
- [ ] **Step 4: Verify AlphabetBar interactions and smooth scroll**
- [ ] **Step 5: Final git status check and clean-up**
