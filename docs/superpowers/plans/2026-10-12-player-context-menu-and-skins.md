# Player Context Menu, Source Locator, and New Themes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement PlayerBar right-click context menu with "Go to Album (Locate Source)", Audio File Properties Modal, 3 new visual skins (Glassmorphism, Metro Dark, Metro Light), and Web Audio dynamic volume normalizer.

**Architecture:** Extend UI store with theme names and highlight state; integrate custom positioned context menu on PlayerBar; attach scroll-and-glow effect on AlbumGrid; inject DynamicsCompressorNode into the existing Web Audio filter graph.

**Tech Stack:** React 19, TypeScript, Tailwind CSS, Web Audio API, Zustand, Lucide React, Fastify.

---

### Task 1: Theme Engine Extensions (Glass, Metro Dark, Metro Light)

**Files:**
- Modify: `client/src/store/uiStore.ts`
- Modify: `client/src/index.css`
- Modify: `client/src/components/TopToolbar.tsx`
- Modify: `client/src/components/SettingsModal.tsx`

- [ ] **Step 1: Add new theme types to `uiStore.ts`**
Add `'glass' | 'metro-dark' | 'metro-light'` to `ThemeName`.

- [ ] **Step 2: Add theme CSS variables to `client/src/index.css`**
Define `[data-theme="glass"]`, `[data-theme="metro-dark"]`, and `[data-theme="metro-light"]` with background tokens, border colors, and accents.

- [ ] **Step 3: Update theme dropdowns**
Add options to the select in `TopToolbar.tsx` and `SettingsModal.tsx`.

- [ ] **Step 4: Verify client builds**
Run: `npm run build:client`
Expected: Build succeeds with 0 errors.

- [ ] **Step 5: Commit changes**
```powershell
git add client/src/store/uiStore.ts client/src/index.css client/src/components/TopToolbar.tsx client/src/components/SettingsModal.tsx
git commit -m "feat(themes): add glassmorphism, metro dark, and metro light themes"
```

---

### Task 2: Web Audio Volume Normalizer (Dynamics Compressor)

**Files:**
- Modify: `client/src/store/equalizerStore.ts`
- Modify: `client/src/components/PlayerBar.tsx`
- Modify: `client/src/components/EqualizerModal.tsx`

- [ ] **Step 1: Add normalizer state in `equalizerStore.ts`**
Add `isNormalizerEnabled: boolean` and `toggleNormalizer: () => void`.

- [ ] **Step 2: Inject `DynamicsCompressorNode` in `PlayerBar.tsx` Web Audio chain**
Create `compressorRef = useRef<DynamicsCompressorNode | null>(null)` and connect it between the 10-band filters and the analyser node when enabled.

- [ ] **Step 3: Add Normalizer switch in `EqualizerModal.tsx`**
Add a toggle button for "Auto-Volume Normalizer (EBU/Peak Compressor)".

- [ ] **Step 4: Verify compilation**
Run: `npm run build:client`
Expected: Passes.

- [ ] **Step 5: Commit changes**
```powershell
git add client/src/store/equalizerStore.ts client/src/components/PlayerBar.tsx client/src/components/EqualizerModal.tsx
git commit -m "feat(audio): add dynamics compressor volume normalizer"
```

---

### Task 3: Technical Audio File Properties Modal

**Files:**
- Create: `client/src/components/TrackPropertiesModal.tsx`
- Modify: `client/src/store/uiStore.ts`
- Modify: `client/src/App.tsx`

- [ ] **Step 1: Add modal state in `uiStore.ts`**
Add `isTrackPropertiesOpen: boolean`, `propertiesTrack: Track | null`, `openTrackProperties: (t: Track) => void`, `closeTrackProperties: () => void`.

- [ ] **Step 2: Create `TrackPropertiesModal.tsx`**
Display container format, bit depth, sample rate, bitrate, channels, file size, date added, and absolute path with clipboard copy.

- [ ] **Step 3: Render modal in `App.tsx`**
Add `<TrackPropertiesModal />` to `MainLayout`.

- [ ] **Step 4: Verify client build**
Run: `npm run build:client`
Expected: Passes.

- [ ] **Step 5: Commit changes**
```powershell
git add client/src/components/TrackPropertiesModal.tsx client/src/store/uiStore.ts client/src/App.tsx
git commit -m "feat(ui): add technical track properties modal"
```

---

### Task 4: PlayerBar Context Menu & Album Source Locator

**Files:**
- Create: `client/src/components/PlayerContextMenu.tsx`
- Modify: `client/src/store/uiStore.ts`
- Modify: `client/src/components/PlayerBar.tsx`
- Modify: `client/src/components/AlbumGrid.tsx`
- Modify: `client/src/App.tsx`

- [ ] **Step 1: Add `highlightedAlbumId` in `uiStore.ts`**
Add `highlightedAlbumId: string | null` and `setHighlightedAlbumId: (id: string | null) => void`.

- [ ] **Step 2: Create `PlayerContextMenu.tsx`**
Implement context menu with:
- "Go to Album in Grid"
- "Open Album Tracklist"
- "Show in Track Table"
- "Filter by Artist"
- "Copy Track Title"
- "Technical Properties"

- [ ] **Step 3: Attach `onContextMenu` in `PlayerBar.tsx`**
Open `PlayerContextMenu` at cursor coordinates `(e.clientX, e.clientY)`.

- [ ] **Step 4: Implement scroll & pulse-glow highlight in `AlbumGrid.tsx`**
Assign `id={`album-card-${album.id}`}` on each card.
When `highlightedAlbumId === album.id`, trigger smooth scroll to view and apply a 3-second animated ring glow.

- [ ] **Step 5: Verify client build**
Run: `npm run build:client`
Expected: Passes.

- [ ] **Step 6: Commit changes**
```powershell
git add client/src/components/PlayerContextMenu.tsx client/src/store/uiStore.ts client/src/components/PlayerBar.tsx client/src/components/AlbumGrid.tsx client/src/App.tsx
git commit -m "feat(player): add player context menu and album source locator"
```

---

### Task 5: Full Build, Asset Deployment & Browser Subagent Verification

**Files:**
- None (Build scripts & browser testing)

- [ ] **Step 1: Build client and copy assets**
Run: `npm run build:client; node scripts/copy-client.js; npm run build:server`

- [ ] **Step 2: Restart server daemon**
Restart background task `npm start`.

- [ ] **Step 3: Use `browser_subagent` to test all features**
- Test right clicking PlayerBar left track info.
- Click "Go to Album in Grid" -> verify smooth scroll and highlight glow.
- Test Theme switching (Glass, Metro Dark, Metro Light).
- Test File Properties modal.
- Test Volume Normalizer toggle.

- [ ] **Step 4: Final commit and summary**
```powershell
git commit -am "chore: deploy player context menu, source locator, and new skins"
```
