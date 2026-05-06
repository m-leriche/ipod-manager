# Crate

A native macOS desktop app for music library management. Built with Tauri 2 (Rust backend) and React 19 (TypeScript frontend).

## Features

### Library Player

Full music library browser with three browsing modes: column browser (Genre/Artist/Album), album art grid, and artwork carousel. Sortable, virtualized track table with search. Native audio playback with gapless transitions, 10/31-band parametric EQ, preamp, playback speed control, and custom presets. Supports MP3, FLAC, WAV, AAC, Ogg Vorbis, Opus, and AIFF.

- **Playlists** — Create, edit, reorder, and persist playlists to SQLite. Smart playlists with rule-based auto-population.
- **Lyrics** — Side panel and fullscreen overlay with synced lyrics display.
- **Mini Player** — Compact always-on-top floating window (300x380px).
- **Queue** — Collapsible queue panel with up-next management.
- **Info & Stats panels** — Track detail view and library-wide statistics (track count, size, duration, format breakdown, genre/year distribution).
- **Last.fm** — Scrobbling integration.
- **Background art repair** — Finds albums missing `cover.jpg`, extracts embedded art from audio tags, falls back to MusicBrainz Cover Art Archive.
- **Background lyrics fetching** — Auto-fetches lyrics for the current library.
- **Filesystem watcher** — Auto-refreshes the library when files change on disk.
- **Media keys** — System media key integration (play/pause/next/previous).
- **Keyboard shortcuts** — Comprehensive shortcuts with Cmd+/ reference dialog.

### Tools

- **iPod** — Auto-detects Rockbox iPod Classic, mounts/unmounts with one click, live storage bar. Parses the Rockbox TagCache binary database to surface play counts, ratings, total play time, and last-played ordering. Disk space safety checks before syncing.
- **File Manager** — Unified file browsing, folder comparison, and sync. Browse any folder, navigate directories, view file sizes/dates, and delete via context menu. Pick two folders and recursively compare them with a color-coded tree (new, modified, extra, matching). Mirror sync, selective copy, or delete with real-time progress and cancellation. Profiles save source/target paths and exclusion filters.
- **Metadata Editor** — Scan a folder and view/edit ID3 tags grouped by Artist/Album/Track. Batch edit across selections with dirty tracking. MusicBrainz repair: compares local metadata track-by-track, detects title mismatches, wrong track numbers, missing tags, year discrepancies, and incomplete albums. Side-by-side comparison with per-fix accept/reject.
- **Audio Extractor** — YouTube audio downloading (via yt-dlp) and local video audio extraction (via ffmpeg). Pick format (FLAC or MP3 320kbps), auto-detect chapters, and split into individual tracks.
- **Duplicates** — Find duplicate tracks across directories by filename, metadata match, or file hash. Side-by-side comparison.
- **Converter** — Batch audio format conversion.

## Prerequisites

- **macOS** (uses `diskutil` and `mount` under the hood)
- **Node.js** >= 18 and npm
- **Rust** toolchain (install via [rustup](https://rustup.rs/))
- **yt-dlp** and **ffmpeg** (optional, for Audio Extractor): `brew install yt-dlp ffmpeg`

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

# Run e2e tests (requires Chromium)
npm run test:e2e

# Run e2e tests with UI mode for debugging
npm run test:e2e:ui

# Lint frontend
npm run lint

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

# Clippy (CI runs with -D warnings)
cd src-tauri && cargo clippy -- -D warnings
```

## Build

```bash
npm run tauri build
```

Output:
- `src-tauri/target/release/bundle/macos/Crate.app`
- `src-tauri/target/release/bundle/dmg/Crate_<version>_aarch64.dmg`

## Project Structure

```
src/
├── App.tsx                              # Root layout with tab navigation
├── App.css                              # Tailwind config + dark theme
├── types/                               # Shared TypeScript types
├── contexts/                            # React Context providers (12)
├── hooks/                               # Custom hooks (keyboard nav, lazy image, etc.)
├── utils/                               # Shared utilities
└── components/
    ├── atoms/                           # Tiny, stateless building blocks
    ├── molecules/                       # Composed atoms with simple logic
    ├── organisms/                       # Domain-aware components
    └── templates/                       # Full page/tab-level containers
        ├── LibraryPlayer/               # Main library browser + player
        ├── FileManager/                 # File browsing, comparison, sync
        ├── MetadataEditor/              # ID3 tag editing + MusicBrainz repair
        ├── AudioExtractor/              # YouTube + video audio extraction
        ├── AudioConverter/              # Batch format conversion
        ├── DuplicateDetector/           # Duplicate track finder
        ├── IpodSummary/                 # iPod info, storage, play data
        ├── MountPanel/                  # Compact iPod mount/unmount sidebar
        └── SettingsModal/               # App settings dialog

src-tauri/src/
├── lib.rs                               # Plugin + command registration
├── commands/                            # Tauri command handlers by domain
│   ├── ipod.rs                          #   iPod mount/unmount, info, play data
│   ├── files.rs                         #   File listing, comparison, copy/delete
│   ├── media.rs                         #   Album art, quality analysis
│   ├── metadata.rs                      #   Tag reading/writing, repair
│   ├── library.rs                       #   Library scan, search, browse
│   ├── playlists.rs                     #   Playlist CRUD, smart playlists
│   ├── audio.rs                         #   Playback, EQ, queue
│   ├── lyrics.rs                        #   Lyrics fetching
│   ├── lastfm.rs                        #   Last.fm scrobbling
│   └── system.rs                        #   Settings, dependencies
├── audio/                               # Native playback engine
│   ├── engine.rs                        #   Playback state machine
│   ├── decoder.rs                       #   symphonia decoding
│   ├── equalizer.rs                     #   10/31-band parametric EQ
│   ├── resampler.rs                     #   Sample rate conversion
│   └── time_stretch.rs                  #   Playback speed control
├── library/                             # SQLite library database
│   ├── scan.rs                          #   Folder scanning + import
│   ├── queries.rs                       #   Track queries + column browser
│   ├── playlists.rs                     #   Playlist persistence
│   ├── smart_playlists.rs              #   Rule-based auto playlists
│   ├── duplicates.rs                    #   Duplicate detection
│   └── reorganize.rs                    #   Library reorganization
├── files/                               # File operations
│   ├── listing.rs                       #   Directory listing (FileEntry)
│   ├── compare.rs                       #   Recursive folder comparison
│   ├── copy.rs                          #   Copy with progress + cancellation
│   └── fileops.rs                       #   Delete, move operations
├── metarepair/                          # MusicBrainz metadata repair
│   ├── detection.rs                     #   Issue detection + comparison
│   ├── lookup.rs                        #   MusicBrainz API lookups
│   └── matching.rs                      #   Release matching logic
├── disk.rs                              # iPod detection, mount/unmount
├── albumart.rs                          # Album art scanning + MusicBrainz
├── metadata.rs                          # Audio tag reading/writing via lofty
├── musicbrainz.rs                       # Shared MusicBrainz API client
├── audioquality.rs                      # Quality analysis, transcode detection, spectrograms
├── convert.rs                           # Audio format conversion
├── lyrics.rs                            # Lyrics fetching
├── lastfm.rs                            # Last.fm API client
├── rockbox.rs                           # Rockbox TagCache binary parser
├── youtube.rs                           # YouTube audio download via yt-dlp
├── localvideo.rs                        # Video audio extraction via ffmpeg
├── watcher.rs                           # Filesystem change watcher
├── streaming.rs                         # Audio streaming utilities
├── libstats.rs                          # Library statistics aggregation
├── profiles.rs                          # Profile persistence
└── ipod_info.rs                         # iPod device info
```

Each component has its own folder with co-located test, types, and helper files.

## Tech Stack

| Layer      | Technology                        |
|------------|-----------------------------------|
| Frontend   | React 19, TypeScript, Tailwind v4 |
| Backend    | Rust, Tauri 2                     |
| Bundler    | Vite 8                            |
| Testing    | Vitest, React Testing Library, Playwright (e2e), cargo test |
| Linting    | ESLint, Clippy                    |
| Formatting | Prettier, rustfmt                 |
| CI         | GitHub Actions (4 parallel jobs: Prettier, Tests, E2E, Rust) |
| Audio      | symphonia (decoding), cpal (playback), lofty (metadata), souvlaki (media keys) |
| Database   | SQLite via rusqlite                |
| External   | yt-dlp + ffmpeg (YouTube/video), ffprobe (quality analysis) |
| Network    | ureq (MusicBrainz, Last.fm)       |
| Images     | image (decode/resize/encode)      |

## How Mounting Works

The app replicates the manual terminal workflow:

```bash
sudo diskutil unmount /dev/disk6s1
sudo mkdir -p /Volumes/IPOD
sudo mount -t msdos /dev/disk6s1 /Volumes/IPOD
```

The Rust backend runs these via `sudo -S`, piping your password through stdin. Your password is never stored — it's cleared from memory immediately after the mount command completes.

## TODO

### Library Player
- [ ] **Rockbox playlist export** — Export playlists as M3U8 files to a mounted iPod for Rockbox playback. Map local library paths to iPod paths.
- [ ] **Queue persistence** — Queue is in-memory only, lost on restart. Save to SQLite or localStorage.
- [ ] **Waveform preview** — Add waveform to the main now-playing bar (exists in MiniPlayer).
- [ ] **Column browser keyboard nav** — Arrow keys to move selection, Enter to confirm.
- [ ] **Resizable column browser** — Drag the divider between browser and track table.
- [ ] **Column browser context menus** — "Play all by artist", "Add to queue", etc.
- [ ] **Scroll position preservation** — Maintain scroll position when switching between column browser selections.
- [ ] **Inline metadata editing** — Edit tags directly in the track table.
- [ ] **Unified search** — Dedicated results view with advanced query syntax (backend exists, frontend incomplete).

### Infrastructure
- [ ] **Swift disk helper** — Replace `diskutil` text parsing with a Swift CLI tool using `DiskArbitration.framework` for event-driven USB detection and native mount/unmount.
- [ ] **tauri-specta typed bridge** — Auto-generate TypeScript types from Rust command signatures, eliminating manual type duplication.

### Features
- [ ] **Batch find-and-replace** in metadata tags
- [ ] **Folder structure normalization** — Flag/fix naming inconsistencies, preview renames as a diff.
- [ ] **Format conversion during sync** — Batch transcode (FLAC to MP3/AAC) to fit more on the iPod.

### Audio Analysis
- [ ] Real-time frequency spectrum, oscilloscope, stereo vectorscope
- [ ] Peak/RMS level meters, spectral waterfall
- [ ] Clipping detection, dynamic range scoring, loudness metering (LUFS)
- [ ] ReplayGain scanning
- [ ] Audio fingerprinting (AcoustID)
- [ ] Silence detection, mono/stereo verification

## License

MIT
