# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

A native macOS desktop app for managing a Rockbox iPod Classic. Tauri 2 (Rust backend) + React 19 (TypeScript frontend). Replaces FreeFileSync + Swinsian + terminal `diskutil`/`mount` commands with a single GUI.

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
npx vitest run src/test/App.test.tsx

# Type-check frontend
npx tsc --noEmit

# Check Rust
cd src-tauri && cargo check
```

## Architecture

**Two-process Tauri 2 app:** a Rust backend process and a webview frontend.

### Frontend → Backend Communication

React calls Rust via `invoke()` from `@tauri-apps/api/core`. All 10 Tauri commands are defined as `#[tauri::command]` async functions in `src-tauri/src/commands.rs` and registered in `src-tauri/src/lib.rs`. Long-running operations (scan, fix, copy) emit real-time progress events via `app.emit()` that the frontend listens to with `listen()`.

### Rust Backend Modules (src-tauri/src/)

- **commands.rs** — Thin Tauri command handlers. Each one delegates to `disk`, `files`, or `albumart`. Entry point for all frontend `invoke()` calls.
- **disk.rs** — macOS-specific iPod detection by parsing `diskutil list` output for FAT32 partitions. Mount/unmount via `sudo mount -t msdos` with password piped through stdin.
- **files.rs** — Directory listing (`FileEntry`), recursive comparison (`CompareEntry` tree), copy/delete with progress events. `SyncCancel` (shared `Arc<AtomicBool>`) enables cancellation from the frontend.
- **albumart.rs** — Scans folders for albums missing `cover.jpg`. Two-tier fix: (1) extract embedded art from audio tags via `lofty`, (2) fetch from MusicBrainz Cover Art Archive via `ureq`. Resizes to 600x600 via `image` crate.

### Frontend Components (src/components/)

- **App.tsx** — Tab layout. Album Art tab always available; File Sync tab requires mounted iPod.
- **MountPanel.tsx** — Polls `detect_ipod` every 10s. Gates `isMounted` state that controls File Sync availability.
- **SyncManager.tsx** — Orchestrates dual FileExplorer panels and ComparisonView.
- **AlbumArtManager.tsx** — Standalone album art workflow (scan → review → fix). Works on any folder, no iPod required.

### Styling

Tailwind v4 with a custom dark theme defined as CSS variables in `src/App.css`. All colors use semantic tokens (`--color-bg-primary`, `--color-text-secondary`, `--color-accent`, etc.).

## Key Patterns

- **Cancellation:** Long operations check a shared `SyncCancel` (`AtomicBool` in Tauri state). Frontend calls `cancel_sync` command to set the flag.
- **Progress events:** Backend emits events like `albumart-progress`, `albumart-scan-progress`, `copy-progress`. Frontend subscribes via `listen()` and updates UI in real-time.
- **macOS only:** Disk operations rely on `diskutil` and `mount` CLI tools. Not portable to other OSes.
- **Testing:** Every React component has a corresponding test file in `src/test/`. When creating a new component, always create a unit test file alongside it. Tests use Vitest + React Testing Library with Tauri API mocks defined in `src/test/setup.ts`.

## Code Style

- Write clean, concise code. No fluff, no over-engineering.
- Fail fast — validate inputs and preconditions early, return/throw immediately. Don't bury error paths deep in nested logic.
- No dead code, no commented-out code, no unused variables.
- No speculative abstractions. Solve the problem at hand, not hypothetical future ones.
- Keep functions short and single-purpose. If it needs a comment explaining what it does, it should probably be its own function with a clear name instead.
- Prefer early returns over deep nesting.
