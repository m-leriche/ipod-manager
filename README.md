# Crate

A native macOS desktop app for music library management. Built with Tauri 2 (Rust backend) and React 19 (TypeScript frontend).

## Features

- **Library player** — Full music library browser with column browser (Genre/Artist/Album), sortable track table, search, and native audio playback. Gapless playback, 10/31-band parametric EQ, preamp, and custom presets. Supports MP3, FLAC, WAV, AAC, Ogg Vorbis, Opus, and AIFF.
- **File Explorer** — Browse any folder on your system. Navigate in and out of directories, view file sizes and dates, and delete files/folders via right-click.
- **Folder comparison & sync** — Pick any two folders and recursively compare them. Color-coded tree view shows new, modified, extra, and matching files. Mirror sync, selective copy, or delete with real-time progress. Profiles save source/target paths and exclusion filters.
- **Album art manager** — Scans music folders for albums missing cover art. Extracts embedded art from audio tags first, then searches MusicBrainz Cover Art Archive as a fallback. Saves `cover.jpg` per album folder.
- **Audio metadata editor & repair** — Scan a folder and view/edit ID3 tags grouped by Artist/Album/Track. Batch edit across selections with dirty tracking. One-click MusicBrainz repair: compares local metadata track-by-track, detects title mismatches, wrong track numbers, missing album artist/sort tags, year discrepancies, and incomplete albums. Review issues per-album with side-by-side comparison, accept or reject individual fixes, and apply in bulk.
- **Audio quality analyzer** — Scans audio files via ffprobe, detects suspect lossy-to-lossless transcodes by measuring high-frequency energy, and generates on-demand spectrograms for visual confirmation. Files grouped by verdict: lossless, lossy, or suspect transcode.
- **YouTube to Audio** — Paste a YouTube URL, pick format (FLAC 44.1kHz/16-bit or MP3 320kbps), and download. Auto-detects chapters and splits into individual tracks.
- **Video to Audio** — Extract audio from local video files with optional user-defined chapter splitting and timestamp validation.
- **iPod management** — Auto-detects Rockbox iPod Classic, mounts/unmounts with one click, live storage bar. Disk space safety checks before syncing.
- **Library statistics** — Scan any music folder for an overview: total tracks, size, duration, average bitrate, artist/album counts, format breakdown, genre and sample rate distribution, and year spread.
- **iPod play data** — Parses the Rockbox TagCache binary database on a mounted iPod to surface play counts, ratings, total play time, and last-played ordering. Sort by most played, least recently played, highest rated, or never played to find music worth keeping or cleaning up. Requires "Gather Runtime Data" enabled in Rockbox settings.

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
- `src-tauri/target/release/bundle/macos/Crate.app`
- `src-tauri/target/release/bundle/dmg/Crate_<version>_aarch64.dmg`

## Project Structure

```
src/
├── App.tsx                              # Root layout with tab navigation
├── App.css                              # Tailwind config + dark theme
├── types/                               # Shared TypeScript types
└── components/
    ├── atoms/                           # Tiny, stateless building blocks
    ├── molecules/                       # Composed atoms with simple logic
    ├── organisms/                       # Domain-aware components
    └── templates/                       # Full page/tab-level containers
        ├── LibraryPlayer/
        ├── AlbumArtManager/
        ├── BrowseExplorer/
        ├── ComparisonView/
        ├── IpodSummary/
        ├── MetadataEditor/
        ├── MountPanel/
        ├── QualityAnalyzer/
        ├── LibraryStats/
        ├── SyncManager/
        ├── VideoExtractor/
        └── YouTubeDownloader/

src-tauri/src/
├── lib.rs                               # Plugin + command registration
├── commands.rs                          # Tauri command handlers
├── disk.rs                              # iPod detection, mount/unmount
├── files.rs                             # Directory listing, comparison, copy/delete
├── albumart.rs                          # Album art scanning + MusicBrainz
├── metadata.rs                          # Audio tag reading/writing via lofty
├── metarepair.rs                        # MusicBrainz-powered metadata validation and repair
├── musicbrainz.rs                       # Shared MusicBrainz API client (search, release details, cover art)
├── audioquality.rs                      # Quality analysis, transcode detection, spectrograms
├── library/                             # SQLite library database (tracks, folders, search, browser data)
├── audio/                               # Native playback engine (symphonia + cpal, EQ, gapless, resampler)
├── libstats.rs                          # Library statistics aggregation via lofty
├── rockbox.rs                           # Rockbox TagCache binary database parser
├── localvideo.rs                        # Local video audio extraction via ffmpeg
├── youtube.rs                           # YouTube audio download via yt-dlp
└── profiles.rs                          # Profile persistence
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
| Audio      | symphonia (decoding), cpal (playback), lofty (metadata), ffmpeg/ffprobe (quality, extraction) |
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

## TODO

### Library Player
- [x] **Fix playcount tags** — Playcount tags not displaying properly in the library view.
- [x] **Playlist support** — Create, edit, reorder, persist to SQLite. Sidebar UI, context menu integration, full CRUD.
- [ ] **Rockbox playlist export** — Export playlists as M3U8 files to a mounted iPod for Rockbox playback. Map local library paths to iPod paths (strip library prefix, prepend iPod music root), write to `/Playlists/` on the device. Path mapping can be inferred from sync profiles or user-selected.
- [x] **Virtual scrolling** — Large track tables (10k+ rows) need virtualization. `@tanstack/react-virtual` is installed and wired into TrackTable with 20-row overscan.
- [ ] **Queue persistence** — Queue is in-memory only, lost on restart. Save to SQLite or localStorage.
- [ ] **Column browser keyboard nav** — Arrow keys to move selection, Enter to confirm.
- [ ] **Resizable column browser** — Drag the divider between browser and track table.
- [ ] **Right-click context menus in column browser** — "Play all by artist", "Add to queue", etc.
- [ ] **Scroll position preservation** — Maintain scroll position when switching between column browser selections.

### Library Management
- [ ] **Folder structure normalization** — Scan a library and flag/fix naming inconsistencies. Target convention like `Artist/Album/01 Track.flac`. Preview renames as a diff before applying.
- [ ] **Duplicate detection** — Find duplicate tracks across directories by filename, metadata match, or file hash. Side-by-side comparison, pick which to keep.
- [ ] **Format conversion** — Batch transcode between formats (FLAC → MP3/AAC) during sync or on demand. Keeps master library lossless while fitting more on the iPod.

### Audio Analysis & Visualization
- [ ] **Real-time frequency spectrum** — Animated bar/curve visualization showing frequency distribution during playback. Bass on the left, treble on the right, powered by Web Audio API's AnalyserNode.
- [ ] **Oscilloscope** — Real-time waveform display showing the actual signal shape as audio plays. Useful for spotting distortion, clipping, or artifacts at a glance.
- [ ] **Stereo vectorscope** — Lissajous XY plot of left vs right channels. Mono signals appear as a vertical line, wide stereo as a cloud, phase issues as a horizontal line.
- [ ] **Peak/RMS level meters** — Classic VU-style meters showing peak and RMS levels per channel during playback. Horizontal or vertical bars alongside the player.
- [ ] **Spectral waterfall** — Scrolling real-time spectrogram during playback. Frequency on Y, time scrolling on X, color for amplitude.
- [ ] **Clipping detection** — Scan for digital clipping (samples at 0dBFS) via ffmpeg's `astats` filter. Surface as a verdict alongside lossy/lossless/suspect in the Quality tab.
- [ ] **Dynamic range (DR score)** — Measure album dynamic range to identify overly compressed loudness-war masters. Pairs with the spectrogram for visual confirmation.
- [ ] **ReplayGain scanning** — Calculate track + album gain values and write them as tags. Rockbox reads ReplayGain natively for consistent playback volume.
- [ ] **Audio fingerprinting (AcoustID)** — Identify unknown or poorly-tagged tracks by audio fingerprint via Chromaprint. Queries AcoustID for MusicBrainz IDs to complement metadata repair.
- [ ] **Silence detection** — Flag tracks with excessive silence at start or end. Offer to trim or surface as a quality issue.
- [ ] **Mono/stereo verification** — Detect files encoded as stereo but actually mono (dual-mono). Wastes space storing duplicate channels.
- [ ] **Loudness metering (LUFS)** — Real-time EBU R128 integrated loudness measurement with momentary, short-term, and integrated readouts.

## License

MIT
