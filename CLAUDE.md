# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

**Crate** — a native macOS desktop app for music library management. Tauri 2 (Rust backend) + React 19 (TypeScript frontend). Features include Rockbox iPod Classic management, file syncing, album art fixing, YouTube audio downloading, and local video audio extraction.

## Commands

```bash
# Dev mode (hot-reloads frontend, rebuilds Rust on change)
npm run tauri dev

# Production build (.app and .dmg)
npm run tauri build

# Frontend only (no Tauri window, just Vite on :5173)
npm run dev

# Run all unit tests
npm test

# Run tests in watch mode
npm run test:watch

# Run a single test file
npx vitest run src/components/templates/SyncManager/SyncManager.test.tsx

# Type-check frontend
npx tsc --noEmit

# Check Rust
cd src-tauri && cargo check
```

## Architecture

**Two-process Tauri 2 app:** a Rust backend process and a webview frontend.

### Frontend → Backend Communication

React calls Rust via `invoke()` from `@tauri-apps/api/core`. Tauri commands are defined as `#[tauri::command]` async functions in `src-tauri/src/commands.rs` and registered in `src-tauri/src/lib.rs`. Long-running operations (scan, fix, copy, extract) emit real-time progress events via `app.emit()` that the frontend listens to with `listen()`.

### Rust Backend Modules (src-tauri/src/)

- **commands.rs** — Thin Tauri command handlers. Each one delegates to `disk`, `files`, `albumart`, `youtube`, or `localvideo`. Entry point for all frontend `invoke()` calls.
- **disk.rs** — macOS-specific iPod detection by parsing `diskutil list` output for FAT32 partitions. Mount/unmount via `sudo mount -t msdos` with password piped through stdin.
- **files.rs** — Directory listing (`FileEntry`), recursive comparison (`CompareEntry` tree), copy/delete with progress events. `SyncCancel` (shared `Arc<AtomicBool>`) enables cancellation from the frontend.
- **albumart.rs** — Scans folders for albums missing `cover.jpg`. Two-tier fix: (1) extract embedded art from audio tags via `lofty`, (2) fetch from MusicBrainz Cover Art Archive via `ureq`. Resizes to 600x600 via `image` crate.
- **youtube.rs** — YouTube audio downloading via `yt-dlp`. Fetches video metadata, extracts audio to FLAC/MP3, and splits by chapters. Emits `youtube-progress` events.
- **localvideo.rs** — Local video audio extraction via `ffmpeg`/`ffprobe`. Probes video duration, extracts audio with optional chapter splitting. Emits `video-extract-progress` events.

### Frontend Components (src/components/)

Follows atomic design with four levels:

- **atoms/** — Tiny, stateless building blocks (Spinner, Pill, FolderPicker)
- **molecules/** — Composed atoms with simple logic (ContextMenu, FilterChip)
- **organisms/** — Domain-aware components (FileExplorer, ProfileSelector, FilterPanel)
- **templates/** — Full page/tab-level containers that compose organisms (SyncManager, ComparisonView, AlbumArtManager, MountPanel, BrowseExplorer, YouTubeDownloader, VideoExtractor)

### Styling

Tailwind v4 with a custom dark theme defined as CSS variables in `src/App.css`. All colors use semantic tokens (`--color-bg-primary`, `--color-text-secondary`, `--color-accent`, etc.).

## Key Patterns

- **Cancellation:** Long operations check a shared `SyncCancel` (`AtomicBool` in Tauri state). Frontend calls `cancel_sync` command to set the flag.
- **Progress events:** Backend emits events like `albumart-progress`, `albumart-scan-progress`, `copy-progress`. Frontend subscribes via `listen()` and updates UI in real-time.
- **macOS only:** Disk operations rely on `diskutil` and `mount` CLI tools. Not portable to other OSes.
- **Testing:** Every component has a co-located test file in its folder (e.g., `ComponentName.test.tsx`). When creating a new component, always create a test alongside it. Tests use Vitest + React Testing Library with Tauri API mocks defined in `src/test/setup.ts`.

## Component Structure

Each component lives in its own folder with this layout:

```
ComponentName/
├── ComponentName.tsx      # Component code (named after the component, not index.tsx)
├── types.ts               # TypeScript interfaces/types (if any)
├── helpers.ts             # Helper functions and utilities (if any)
├── constants.ts           # Constants, config maps (if any)
├── SubComponent.tsx       # Extracted sub-components (if any)
└── ComponentName.test.tsx # Co-located unit test
```

Rules:
- Use `const` arrow function declarations, not `function` declarations.
- Extract types/interfaces out of component files into `types.ts`.
- Extract helper functions into `helpers.ts`. Keep component files focused on rendering.
- Keep components small and human-readable. If a sub-component grows beyond a few lines, extract it to its own file in the same folder.
- Shared types used across multiple components go in `src/types/`.
- No barrel files. Import directly from the component's folder — never create re-export files that just forward imports.
- Name component files `ComponentName.tsx`, not `index.tsx`. Imports should be explicit: `from "./ComponentName/ComponentName"`.

## Pre-PR Checklist

Before committing and pushing, always run these checks and fix any issues:

```bash
# Format frontend code
npx prettier --write "src/**/*.{ts,tsx}"

# Format Rust code
cd src-tauri && cargo fmt

# Type-check frontend
npx tsc --noEmit

# Check Rust compiles
cd src-tauri && cargo check

# Run all tests
npm test
```

## Library Player TODOs

- [ ] Refine playback engine — gapless transitions, handle unsupported formats gracefully, persist queue across restarts
- [ ] Improve library loading — show skeleton/shimmer while scanning, background incremental re-scan on app launch
- [ ] Virtual scrolling for large track tables (10k+ rows)
- [ ] Scroll position preservation when switching between column browser selections
- [ ] Lazy-load album artwork in column browser and grid views (batch load visible items)
- [ ] Waveform preview in now-playing bar
- [ ] Playlist support — create, edit, reorder, persist to database
- [ ] Drag-to-reorder queue panel
- [ ] Keyboard navigation in column browser (arrow keys to move selection, enter to confirm)
- [ ] Resizable column browser height (drag the divider between browser and track table)
- [ ] Remember column widths, sort preferences, and column browser selections in localStorage
- [ ] Right-click context menus in column browser (play all by artist, etc.)
- [ ] Status bar with total library stats (tracks, duration, size)
- [ ] Fix album art repair — MusicBrainz lookup and embedded art extraction have reliability issues, needs investigation and hardening

## Code Style

- Write clean, concise code. No fluff, no over-engineering.
- Fail fast — validate inputs and preconditions early, return/throw immediately. Don't bury error paths deep in nested logic.
- No dead code, no commented-out code, no unused variables.
- No speculative abstractions. Solve the problem at hand, not hypothetical future ones.
- Keep functions short and single-purpose. If it needs a comment explaining what it does, it should probably be its own function with a clear name instead.
- Prefer early returns over deep nesting.
