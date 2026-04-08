# iPod Manager

A native macOS desktop app for managing a Rockbox iPod Classic. Replaces the workflow of using FreeFileSync + Swinsian + terminal commands with a single clean GUI.

Built with Tauri 2 (Rust backend) and React 19 (TypeScript frontend).

## Features

- **One-click mount/unmount** — Detects your iPod automatically, mounts it at `/Volumes/IPOD` with a single click and your macOS password. No more typing `diskutil` and `mount` commands in the terminal.
- **Dual file explorer** — Side-by-side browsing panels. Left panel browses any folder on your Mac (external drives, local folders). Right panel browses your iPod. Navigate, select folders, and compare.
- **Folder comparison** — Recursively compares two folders and shows a hierarchical tree view of differences. Color-coded: green for new files (on source, not on iPod), yellow for modified, red for extra files on iPod, gray for matching.
- **Selective sync** — Check individual files or entire folders, then copy to iPod, copy to source, or delete. Nothing happens without explicit confirmation.

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

## Usage

1. **Plug in your iPod** — the app auto-detects it and shows the device info.
2. **Enter your macOS password** and click **Mount** (or press Enter). The iPod mounts at `/Volumes/IPOD`.
3. **Browse** — the dual explorer appears. Left panel starts at `/Volumes` so you can find your external drive. Right panel shows the iPod.
4. **Select folders** — navigate to your music folder on each side and click **Select Folder** on both panels.
5. **Compare** — click **Compare Folders**. The app recursively diffs both directories and shows a collapsible tree of results.
6. **Sync** — check the files you want, then click **Copy to iPod** or other actions. Only checked files are affected.
7. **Eject** — click **Eject** when done.

## Project Structure

```
ipod-manager/
├── src/                          # React frontend
│   ├── App.tsx                   # Root layout
│   ├── App.css                   # Tailwind config + theme
│   └── components/
│       ├── MountPanel.tsx        # iPod detection, mount/unmount UI
│       ├── SyncManager.tsx       # Dual explorer + compare orchestrator
│       ├── FileExplorer.tsx      # Reusable file browser panel
│       └── ComparisonView.tsx    # Tree diff view with sync actions
├── src-tauri/                    # Rust backend
│   └── src/
│       ├── main.rs               # Tauri entry point
│       ├── lib.rs                # Command registration
│       ├── commands.rs           # Tauri command handlers
│       ├── disk.rs               # diskutil parsing, mount/unmount logic
│       └── files.rs              # Directory listing, comparison, copy/delete
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
