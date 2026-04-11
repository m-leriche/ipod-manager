# iPod Manager

A native macOS desktop app for managing a Rockbox iPod Classic. Replaces the workflow of using FreeFileSync + Swinsian + terminal commands with a single clean GUI.

Built with Tauri 2 (Rust backend) and React 19 (TypeScript frontend).

## Features

- **File Explorer** — Browse any folder on your system. Navigate in and out of directories, view file sizes and dates, and delete files/folders via right-click.
- **Folder comparison & sync** — Pick any two folders (iPod, external drives, local folders) and recursively compare them. Color-coded tree view shows new, modified, extra, and matching files. Mirror sync, selective copy, or delete with real-time progress.
- **Profiles** — Named presets that store source/target folder paths and exclusion filters. Create profiles for different devices (e.g., "My iPod", "Backup Drive"). Save/discard changes explicitly.
- **Exclusion filters** — Right-click folders in the comparison tree to filter them out. Filtered folders are hidden from comparison and excluded from sync operations. Manage filters via the filter panel.
- **iPod mount/unmount** — Auto-detects your iPod, mounts it at `/Volumes/IPOD` with one click and your macOS password. Live storage bar shows used/free/total space.
- **Album art manager** — Scans any music folder for albums missing cover art. Extracts embedded art from audio file tags first (fast, no network), then searches MusicBrainz Cover Art Archive as a fallback. Saves `cover.jpg` per album folder for Rockbox compatibility.
- **YouTube to Audio** — Paste a YouTube URL, pick an output folder and format (FLAC 44.1kHz/16-bit or MP3 320kbps), and download with real-time progress. Automatically detects video chapters and splits them into individually numbered tracks in a subfolder. Requires `yt-dlp` and `ffmpeg` (install via `brew install yt-dlp ffmpeg`).
- **Disk space safety** — Pre-flight check warns if there isn't enough space before copying starts. If space runs out mid-copy, stops immediately and cleans up partial files.

## Prerequisites

- **macOS** (uses `diskutil` and `mount` under the hood)
- **Node.js** >= 18 and npm
- **Rust** toolchain (install via [rustup](https://rustup.rs/))
- **yt-dlp** and **ffmpeg** (optional, for YouTube to Audio tab): `brew install yt-dlp ffmpeg`

## Setup

```bash
git clone <repo-url>
cd ipod-manager
npm install
```

## Development

```bash
# Run the app in dev mode (hot-reloads frontend, rebuilds Rust on change)
npm run tauri dev

# Run all unit tests
npm test

# Run tests in watch mode
npm run test:watch

# Format code
npm run format

# Check formatting (used in CI)
npm run format:check

# Type-check frontend
npx tsc --noEmit

# Check Rust
cd src-tauri && cargo check

# Run Rust tests
cd src-tauri && cargo test

# Format Rust code
cd src-tauri && cargo fmt

# Check Rust formatting (used in CI)
cd src-tauri && cargo fmt --check
```

## Build

```bash
npm run tauri build
```

Output:
- `src-tauri/target/release/bundle/macos/iPod Manager.app`
- `src-tauri/target/release/bundle/dmg/iPod Manager_<version>_aarch64.dmg`

## Usage

1. **File Explorer** (default tab) — Browse to pick a folder and explore its contents. Right-click to delete files or folders.
2. **File Sync** — Create or select a profile, browse source and target folders, then click **Compare Folders**. Review the diff tree, right-click folders to add exclusion filters, and sync with Mirror/Copy/Delete.
3. **Album Art** — Browse to a music folder, scan for missing art, and click **Fix** to extract or fetch cover images.
4. **YouTube to Audio** — Paste a YouTube URL, select an output folder and format (FLAC or MP3), then download. If the video has chapters (e.g., a live concert with song timestamps), they're detected automatically and each chapter is saved as a numbered track in a subfolder. The tab checks for `yt-dlp`/`ffmpeg` on load and shows install instructions if missing.
5. **iPod** — The connection panel on the left auto-detects your iPod. Enter your macOS password and click **Mount** to mount it at `/Volumes/IPOD`. Click **Eject** when done.

## Project Structure

```
src/
├── App.tsx                              # Root layout with tab navigation
├── App.css                              # Tailwind config + dark theme
├── types/                               # Shared TypeScript types
└── components/
    ├── atoms/                           # Tiny, stateless building blocks
    │   ├── FolderPicker/
    │   ├── Pill/
    │   └── Spinner/
    ├── molecules/                       # Composed atoms with simple logic
    │   ├── ContextMenu/
    │   └── FilterChip/
    ├── organisms/                       # Domain-aware components
    │   ├── FileExplorer/
    │   ├── FilterPanel/
    │   └── ProfileSelector/
    └── templates/                       # Full page/tab-level containers
        ├── AlbumArtManager/
        ├── BrowseExplorer/
        ├── ComparisonView/
        ├── MountPanel/
        ├── SyncManager/
        └── YouTubeDownloader/

src-tauri/src/
├── main.rs                              # Tauri entry point
├── lib.rs                               # Plugin + command registration
├── commands.rs                          # Tauri command handlers (all async)
├── disk.rs                              # diskutil parsing, mount/unmount
├── files.rs                             # Directory listing, comparison, copy/delete
├── albumart.rs                          # Album art scanning, tag reading, MusicBrainz
├── profiles.rs                          # Profile persistence (JSON in app data dir)
└── youtube.rs                           # YouTube audio download via yt-dlp
```

Each component has its own folder with co-located test, types, and helper files.

## Tech Stack

| Layer      | Technology                        |
|------------|-----------------------------------|
| Frontend   | React 19, TypeScript, Tailwind v4 |
| Backend    | Rust, Tauri 2                     |
| Bundler    | Vite 8                            |
| Testing    | Vitest, React Testing Library, cargo test |
| Formatting | Prettier, rustfmt                 |
| CI         | GitHub Actions                    |
| Audio      | lofty (metadata/tag reading)      |
| YouTube    | yt-dlp + ffmpeg (external CLI)    |
| Network    | ureq (MusicBrainz API)            |
| Images     | image (decode/resize/encode)      |

## How Mounting Works

The app replicates the manual terminal workflow:

```bash
sudo diskutil unmount /dev/disk6s1
sudo mkdir -p /Volumes/IPOD
sudo mount -t msdos /dev/disk6s1 /Volumes/IPOD
```

The Rust backend runs these via `sudo -S`, piping your password through stdin. Your password is never stored — it's cleared from memory immediately after the mount command completes.

## License

MIT
