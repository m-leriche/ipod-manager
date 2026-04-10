# iPod Manager

A native macOS desktop app for managing a Rockbox iPod Classic. Replaces the workflow of using FreeFileSync + Swinsian + terminal commands with a single clean GUI.

Built with Tauri 2 (Rust backend) and React 19 (TypeScript frontend).

## Features

- **One-click mount/unmount** — Detects your iPod automatically, mounts it at `/Volumes/IPOD` with a single click and your macOS password. No more typing `diskutil` and `mount` commands in the terminal.
- **Storage overview** — Connection panel shows a live storage bar with used/free/total space, color-coded by usage.
- **Dual file explorer** — Side-by-side browsing panels. Left panel browses any folder on your Mac (external drives, local folders). Right panel browses your iPod. Navigate, select folders, and compare.
- **Folder comparison** — Recursively compares two folders and shows a hierarchical tree view of differences. Color-coded: green for new files (on source, not on iPod), yellow for modified, red for extra files on iPod, gray for matching.
- **Mirror sync** — One-click mirror makes the iPod folder an exact copy of the source: copies new/modified files and deletes extras. Individual copy/delete operations also available for fine-grained control.
- **Disk space safety** — Pre-flight check warns if there isn't enough space before copying starts. If space runs out mid-copy, stops immediately and cleans up partial files.
- **Album art manager** — Scans any music folder for albums missing cover art. Extracts embedded art from audio file tags first (fast, no network), then searches MusicBrainz Cover Art Archive as a fallback. Saves `cover.jpg` per album folder for Rockbox compatibility.

## Prerequisites

- **macOS** (uses `diskutil` and `mount` under the hood)
- **Node.js** >= 18 and npm
- **Rust** toolchain (install via [rustup](https://rustup.rs/))
- A **Rockbox iPod Classic** (mounts as USB mass storage with FAT32 partition)

## Setup

```bash
# Clone the project
git clone <repo-url>
cd ipod-manager

# Install frontend dependencies
npm install

# Install Rust (if not already installed)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

## Development

```bash
# Run the app in dev mode (hot-reloads frontend, rebuilds Rust on change)
npm run tauri dev
```

This starts the Vite dev server on port 5173 and launches the Tauri window.

## Build

```bash
# Build a release .app bundle
npm run tauri build
```

Output:
- `src-tauri/target/release/bundle/macos/iPod Manager.app`
- `src-tauri/target/release/bundle/dmg/iPod Manager_<version>_aarch64.dmg`

Drag the `.app` to `/Applications` to use it like any other Mac app.

## Usage

1. **Plug in your iPod** — the app auto-detects it and shows the device info.
2. **Enter your macOS password** and click **Mount** (or press Enter). The iPod mounts at `/Volumes/IPOD`.
3. **Browse** — the dual explorer appears. Left panel starts at `/Volumes` so you can find your external drive. Right panel shows the iPod.
4. **Select folders** — navigate to your music folder on each side and click **Select Folder** on both panels.
5. **Compare** — click **Compare Folders**. The app recursively diffs both directories and shows a collapsible tree of results.
6. **Sync** — click **Mirror to iPod** to make the iPod folder match the source exactly, or use the individual copy/delete buttons for selective sync.
7. **Album Art** — switch to the **Album Art** tab, browse to a music folder, scan for missing art, and click **Fix** to extract or fetch cover images.
8. **Eject** — click **Eject** when done.

## Project Structure

```
ipod-manager/
├── src/                          # React frontend
│   ├── App.tsx                   # Root layout with tab navigation
│   ├── App.css                   # Tailwind config + theme
│   └── components/
│       ├── MountPanel.tsx        # iPod detection, mount/unmount, storage bar
│       ├── SyncManager.tsx       # Dual explorer + compare orchestrator
│       ├── FileExplorer.tsx      # Reusable file browser panel
│       ├── ComparisonView.tsx    # Tree diff view with mirror/sync actions
│       └── AlbumArtManager.tsx   # Album art scanning, extraction, and fetch
├── src-tauri/                    # Rust backend
│   └── src/
│       ├── main.rs               # Tauri entry point
│       ├── lib.rs                # Plugin + command registration
│       ├── commands.rs           # Tauri command handlers (all async)
│       ├── disk.rs               # diskutil parsing, mount/unmount, space info
│       ├── files.rs              # Directory listing, comparison, copy/delete
│       └── albumart.rs           # Album art scanning, tag reading, MusicBrainz
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
└── README.md
```

## Tech Stack

| Layer    | Technology                        |
|----------|-----------------------------------|
| Frontend | React 19, TypeScript, Tailwind v4 |
| Backend  | Rust, Tauri 2                     |
| Bundler  | Vite 8                            |
| Styling  | Tailwind CSS with custom theme    |
| Audio    | lofty (metadata/tag reading)      |
| Network  | ureq (MusicBrainz API)            |
| Images   | image (decode/resize/encode)      |

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
