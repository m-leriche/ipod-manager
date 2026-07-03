# Crate

A native macOS desktop app for music library management. Built with Tauri 2 (Rust backend) and React 19 (TypeScript frontend).

## Features

### Library Player

Full music library browser with three browsing modes: column browser (Genre/Artist/Album), album art grid, and artwork carousel. Sortable, virtualized track table with search. Native audio playback with gapless transitions, a waveform seek bar, 10/31-band parametric EQ, preamp, playback speed control, and custom presets. Supports MP3, FLAC, WAV, AAC, Ogg Vorbis, Opus, and AIFF.

- **Command palette** — Fuzzy-search jump-to-anything launcher (Cmd+K) for tabs, tools, and actions.
- **Playlists** — Create, edit, reorder, and persist playlists to SQLite. Smart playlists with rule-based auto-population. Drag-to-reorder in playlist detail. Export as Rockbox-compatible `.m3u8` files.
- **Lyrics** — Side panel and fullscreen overlay with synced lyrics display.
- **Mini Player** — Compact always-on-top floating window (300x380px).
- **Queue** — Collapsible queue panel with up-next management.
- **Info & Stats panels** — Track detail view and library-wide statistics (track count, size, duration, format breakdown, genre/year distribution).
- **Last.fm** — Scrobbling with an offline queue that flushes when the network returns.
- **Background art repair** — Finds albums missing `cover.jpg`, extracts embedded art from audio tags, falls back to MusicBrainz Cover Art Archive.
- **Background lyrics fetching** — Auto-fetches lyrics for the current library.
- **Filesystem watcher** — Auto-refreshes the library when files change on disk.
- **Media keys** — System media key integration (play/pause/next/previous).
- **Undo** — Multi-level undo for metadata edits, ratings, and other destructive actions.
- **Keyboard shortcuts** — Comprehensive shortcuts with Cmd+/ reference dialog.
- **First-run onboarding** — Welcome screen for choosing a library folder, plus a one-time guided feature tour.
- **Custom themes** — 7 built-in themes (dark, light, win95, classic, winamp, aqua, spotify) plus a custom theme editor for creating your own color schemes.

### Inbox

A staging area for newly downloaded music. Point Crate at the folder where downloads land, and each album is checked for complete tags, cover art, a full tracklist, and duplicates before it can be filed into your library.

- **Readiness checks** — Per-album verification of tags, artwork, and tracklist completeness against MusicBrainz, with duplicate detection against your existing library.
- **One-click filing** — File a ready album (or all ready albums) into the library, with optional cleanup of the originals. Filing is undoable.
- **Convert on file** — Transcode albums to a target format as they're filed.
- **Auto-watch** — A filesystem watcher rescans the inbox as new folders appear.

### Tools

- **iPod** — Auto-detects Rockbox iPod Classic, mounts/unmounts with one click, live storage bar. Parses the Rockbox TagCache binary database to surface play counts, ratings, total play time, and last-played ordering. Disk space safety checks before syncing.
- **File Manager** — Unified file browsing, folder comparison, and sync. Browse any folder, navigate directories, view file sizes/dates, and delete via context menu (moved to Trash, recoverable). Pick two folders and recursively compare them with a color-coded tree (new, modified, extra, matching). Mirror sync, selective copy, or delete with real-time progress and cancellation. Optionally transcode lossless files to a smaller format during sync to fit more on the iPod. Profiles save source/target paths and exclusion filters.
- **Metadata Editor** — Scan a folder and view/edit ID3 tags grouped by Artist/Album/Track. Batch edit across selections with dirty tracking. MusicBrainz repair: compares local metadata track-by-track, detects title mismatches, wrong track numbers, missing tags, year discrepancies, and incomplete albums. AcoustID acoustic fingerprinting to identify untagged tracks. Side-by-side comparison with per-fix accept/reject.
- **Quality Analyzer** — Scan a folder for real audio quality: probes codec, bitrate, and sample rate; detects upscaled/transcoded lossy-to-lossless fakes; renders spectrograms and waveforms; and previews audio inline.
- **Audio Extractor** — YouTube audio downloading (via yt-dlp) and local video audio extraction (via ffmpeg). Pick format (FLAC or MP3 320kbps), auto-detect chapters, and split into individual tracks.
- **Duplicates** — Find duplicate tracks across directories by filename, metadata match, or file hash. Side-by-side comparison.
- **Converter** — Batch audio format conversion between MP3 and FLAC with quality presets (128/320 kbps for MP3, multiple sample rate/bit depth options for FLAC). Shows codec info and warns when converting lossy sources to lossless.
- **Health Dashboard** — Analyzes your library for metadata issues (missing tags, artwork, lyrics) and displays them in a categorized dashboard with severity levels. Click through to view affected tracks and repair directly.
- **Export / Import** — Export your library's metadata (tracks, playlists, smart playlists, ratings, play counts) to a JSON backup. Restore from backup when rebuilding your library to preserve organization.
- **Streaming Server** — Built-in Subsonic-compatible server for streaming your library to any Subsonic client (Amperfy, Symfonium, DSub, etc.) over WiFi or Tailscale. See [Streaming Server](#streaming-server-wifi-sync) for setup.

### Discover

- **Recommendations** — Personalized album recommendations seeded by your listening habits (most played, recently played, recently added, or random). Genre-based exploration, artist/album search, and dismiss-to-refresh. Powered by Last.fm.
- **New Releases** — Watch specific artists and get notified when they release new albums, EPs, or singles. Shows which releases are already in your library and which are new.
- **Nebula** — An interactive star-map of your library. Tracks are plotted as points and clustered by genre into glowing nebulae; click any point to play it and explore your collection visually.

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

## Releasing

Releases are automated via GitHub Actions. To publish a new version:

1. **Bump the version** in all three files:
   - `package.json`
   - `src-tauri/Cargo.toml`
   - `src-tauri/tauri.conf.json`

2. **Commit, tag, and push:**
   ```bash
   git add -A && git commit -m "Bump version to X.Y.Z"
   git tag vX.Y.Z
   git push && git push origin vX.Y.Z
   ```

3. **Wait for the build** (~5-10 min) at [Actions](https://github.com/m-leriche/ipod-manager/actions)

4. **Publish the release** — go to [Releases](https://github.com/m-leriche/ipod-manager/releases), open the draft, edit notes if needed, and click **Publish release**

The app checks for updates via Settings or the **Crate > Check for Updates** menu item. Users running a previous version will see the update and can install it in-place.

### Release signing

Update bundles are signed with a Tauri signing key (separate from macOS code signing). The public key is at `src-tauri/keys/update.key.pub` and configured in `src-tauri/tauri.conf.json`. The private key is stored as a GitHub Actions secret (`TAURI_SIGNING_PRIVATE_KEY`).

To regenerate keys (breaks updates for users on older versions):
```bash
npx tauri signer generate -w src-tauri/keys/update.key
```
Then update the `pubkey` in `tauri.conf.json` under `plugins.updater` and replace the `TAURI_SIGNING_PRIVATE_KEY` secret in GitHub.

## Project Structure

```
src/
├── App.tsx                              # Root layout with tab navigation
├── App.css                              # Tailwind config + themes
├── types/                               # Shared TypeScript types
├── contexts/                            # React Context providers (playback, playlist, EQ, undo, toast, …)
├── hooks/                               # Custom hooks (keyboard nav, lazy image, event listeners, …)
├── utils/                               # Shared utilities
└── components/
    ├── atoms/                           # Tiny, stateless building blocks
    ├── molecules/                       # Composed atoms with simple logic
    ├── organisms/                       # Domain-aware components (TrackTable, ColumnBrowser, NowPlayingBar, CommandPalette, …)
    └── templates/                       # Full page/tab-level containers
        ├── LibraryPlayer/               # Main library browser + player
        ├── InboxView/                   # Download inbox: verify + file new albums
        ├── FileManager/                 # File browsing, comparison, sync
        ├── SyncManager/                 # Folder sync with optional transcode
        ├── MetadataEditor/              # ID3 tag editing + MusicBrainz/AcoustID repair
        ├── QualityAnalyzer/             # Audio quality analysis, spectrograms, waveforms
        ├── AudioExtractor/              # YouTube + video audio extraction
        ├── AudioConverter/              # Batch format conversion
        ├── DuplicateDetector/           # Duplicate track finder
        ├── LibraryHealthDashboard/      # Library metadata health analysis
        ├── LibraryStats/                # Library-wide statistics
        ├── LibraryExport/               # Library metadata export/import
        ├── IpodSummary/                 # iPod info, storage, play data
        ├── MountPanel/                  # Compact iPod mount/unmount sidebar
        ├── DiscoverView/                # Album recommendations via Last.fm
        ├── NewReleasesView/             # New release tracking for watched artists
        ├── NebulaView/                  # Genre-clustered visual library map
        ├── WelcomeScreen/ + FeatureTour/ # First-run onboarding
        └── SettingsModal/               # App settings dialog

src-tauri/src/
├── lib.rs                               # Plugin + command registration + startup
├── commands/                            # Thin Tauri command handlers, split by domain
│   ├── ipod, files, media, metadata     #   (each delegates to a domain module below)
│   ├── library/, playlists, audio, queue
│   ├── lyrics, lastfm, discover, recommend, inbox
│   └── artist_releases, health, subsonic, system, …
├── audio/                               # Native playback engine
│   ├── engine/                          #   Playback state machine (decode, playback, transitions)
│   ├── decoder.rs, resampler.rs         #   symphonia decode + sample-rate conversion
│   ├── equalizer.rs, time_stretch.rs    #   10/31-band EQ + speed control
│   ├── crossfade.rs, output.rs          #   Gapless/crossfade + cpal output
│   └── shared_state.rs, types.rs
├── library/                             # SQLite library database
│   ├── schema.rs, scan.rs, indexing.rs  #   Schema, folder scan/import, FTS + sort-key indexes
│   ├── queries/                         #   Track queries + column-browser aggregates
│   ├── playlists.rs, smart_playlists.rs
│   ├── duplicates.rs, reorganize.rs, health.rs
│   ├── backup.rs, export.rs, import.rs, recovery.rs
│   └── settings.rs, folders.rs, types.rs
├── inbox/                               # Download inbox: scan, checks, tags, convert, file, watch
├── files/                               # Listing, compare, copy, transcode, trash-delete
├── metarepair/                          # MusicBrainz metadata repair (detection, lookup, matching)
├── musicbrainz/                         # Shared MusicBrainz client (cache, genres, normalization)
├── disk/                                # iPod detection + mount/unmount
├── albumart/                            # Album art scan + fetch/embed
├── metadata/                            # Audio tag read/write via lofty
├── audioquality/                        # Quality analysis, transcode detection, spectrograms, waveforms
├── convert/                             # Audio format conversion
├── subsonic/                            # Subsonic-compatible streaming server (axum)
├── rockbox/                             # Rockbox TagCache binary read/write
├── youtube/                             # YouTube audio download via yt-dlp
├── localvideo.rs                        # Video audio extraction via ffmpeg
├── discover/, recommend/                # Last.fm recommendations + track suggestions
├── artist_releases/                     # New-release watchlist
├── lyrics/                              # Lyrics fetch (LRCLIB) + tag/db storage
├── lastfm.rs, lastfm_queue.rs           # Last.fm client + offline scrobble queue
├── acoustid.rs                          # AcoustID fingerprint identification
├── genre/                               # Genre lookup + whitelist normalization
├── playlist_export.rs, playlist_sync/   # Rockbox .m3u8 export + sync
├── ipod_info/                           # iPod device info + capacity
├── watcher.rs                           # Filesystem change watcher
├── streaming.rs                         # In-app stream:// asset protocol
├── network.rs, process.rs               # HTTP + subprocess helpers
├── libstats.rs, profiles.rs, sanitize.rs, validation.rs
└── mediakeys.rs, volume_monitor.rs      # Media keys + system volume
```

Each component has its own folder with co-located test, types, and helper files. Rust modules are kept small (~500 lines max) and split by domain.

## Tech Stack

| Layer      | Technology                        |
|------------|-----------------------------------|
| Frontend   | React 19, TypeScript, Tailwind v4 |
| Backend    | Rust, Tauri 2                     |
| Bundler    | Vite 8                            |
| Testing    | Vitest, React Testing Library, Playwright (e2e), cargo test |
| Linting    | ESLint, Clippy                    |
| Formatting | Prettier, rustfmt                 |
| CI         | GitHub Actions (6 parallel jobs: Prettier, ESLint, Tests, Build, E2E, Rust) |
| Audio      | symphonia (decoding), cpal (playback), lofty (metadata), souvlaki (media keys) |
| Database   | SQLite via rusqlite (WAL, FTS5)   |
| Streaming  | axum (Subsonic-compatible server) |
| External   | yt-dlp + ffmpeg (YouTube/video), ffprobe (quality analysis), fpcalc (AcoustID) |
| Network    | ureq (MusicBrainz, Last.fm, LRCLIB, AcoustID) |
| Images     | image (decode/resize/encode)      |

## How Mounting Works

The app replicates the manual terminal workflow:

```bash
sudo diskutil unmount /dev/disk6s1
sudo mkdir -p /Volumes/IPOD
sudo mount -t msdos /dev/disk6s1 /Volumes/IPOD
```

The Rust backend runs these via `sudo -S`, piping your password through stdin. Your password is never stored — it's cleared from memory immediately after the mount command completes.

## Streaming Server (WiFi Sync)

Crate runs a built-in [Subsonic](http://www.subsonic.org/pages/api.jsp)-compatible server so you can stream your library to any Subsonic client on your phone or other devices. No cloud, no subscriptions — everything stays on your local network.

### Quick Start

1. **Open Settings** (gear icon) and scroll to **Streaming Server**
2. The server starts automatically when the app launches — you'll see a green dot and `Running on port 4533`
3. **Set credentials** — the server ships with default `admin`/`admin` credentials. **Remote access is blocked until you change them.** Click "Change credentials" to set a real username and password (requires app restart).
4. **Copy the Server URL** shown under "Local WiFi" (e.g. `http://192.168.1.42:4533`)
5. **Open your Subsonic client** (Amperfy, play:Sub, Symfonium, DSub, etc.) and add a new server:
   - **Server URL:** paste the URL from step 4
   - **Username/Password:** the credentials you set in step 3
6. Your full library appears in the client — browse, search, and stream

### Security

With default credentials (`admin`/`admin`), the server binds to **localhost only** (`127.0.0.1`) — it's only accessible from your own machine. Once you set custom credentials, the server binds to all interfaces (`0.0.0.0`) and is accessible from other devices on your network. Settings shows a yellow warning banner when remote access is blocked.

### Network & Remote Access

The settings panel shows a labeled URL for each detected network interface:

| Label | When it appears |
|-------|-----------------|
| **Local WiFi** | Connected to a home/office network (192.168.x.x or 10.x.x.x) |
| **Tailscale** | Tailscale VPN is running (100.64.x.x range) — use this to stream from anywhere |
| **Local Network** | Other private network (172.16–31.x.x) |

Your phone and computer must be on the **same network** for Local WiFi URLs to work. For streaming outside your home network, install [Tailscale](https://tailscale.com/) on both devices and use the Tailscale URL.

### Supported Clients

Any app that speaks the Subsonic API works. Tested with:
- **iOS:** Amperfy, play:Sub
- **Android:** Symfonium, DSub, Ultrasonic
- **Desktop:** Submariner, Sonixd

### Details

- **Default port:** 4533 (configurable in Settings, restart required)
- **Protocol:** HTTP with Subsonic API v1.16.1
- **Auth:** Username/password or token-based (MD5), per the Subsonic spec
- **Compression:** XML responses are gzip-compressed; audio streams are not
- **Concurrent access:** Each request gets its own read-only SQLite connection (WAL mode), so multiple clients can sync simultaneously without blocking

## TODO

### Recommended next

A codebase review surfaced these as the highest-leverage work, roughly in priority order:

1. **macOS code-signing + notarization** — The release pipeline only signs the *updater* bundle (minisign), not the `.app`/`.dmg`. Unsigned builds hit Gatekeeper, and — more importantly — in-place auto-updates are unreliable on modern macOS for un-notarized apps, which hobbles the updater we already ship. Add a Developer ID cert + notarization + hardened-runtime entitlements to `release.yml`. Unblocks distribution *and* the update feature.
2. **Resume last session on open** — see [Playback & Library](#playback--library) below.
3. **Quick performance wins** — `sort_by_cached_key` in the column-browser aggregates, a shared `ureq::Agent` with timeouts, and parallel AcoustID fingerprinting (details in [Performance](#performance)).
4. **Interactive inline ratings** — wire up star clicks in the track table with optimistic updates (details in [Playback & Library](#playback--library)).
5. **Security hardening** — rotate the Last.fm shared secret (committed to a public repo), default the Subsonic server to `127.0.0.1`, and move its password to the Keychain (details in [Security](#security)).
6. **Safety net** — a `std::panic::set_hook` + global frontend error handler, a CI coverage gate, and tests for the playback/playlist contexts and `disk/mount.rs`.

### Playback & Library
- [ ] **Resume last session on open** — Persist the last-played track (and playback position) across restarts. On launch, pre-load it into the player, paused, so pressing Play resumes where you left off. The queue is currently in-memory only, so nothing survives a restart today. Store in SQLite settings (or a `last_session` row) and restore in `usePlaybackEngine` on boot.
- [ ] **Queue persistence** — Save the full queue + current index (pairs naturally with the resume feature above) so the entire up-next list survives a restart.
- [ ] **Interactive inline star rating** — Stars in the track table currently render read-only (`TrackRow.tsx:148` passes no `onChange`); ratings only work via right-click or the detail panel. Pass an `onChange` through to `onRateTracks` for click-to-rate.
- [ ] **Optimistic rating/flag updates** — Rating a track currently refetches the whole library (`useLibraryActions.ts`). Update `tracks` in place instead (the play-count listener in `useLibraryData.ts` already models this).
- [ ] **Column browser keyboard nav** — Arrow keys to move selection, Enter to confirm.
- [ ] **Resizable column browser** — Drag the divider between browser and track table.
- [ ] **Column browser context menus** — "Play all by artist", "Add to queue", etc.
- [ ] **Scroll position preservation** — Maintain scroll position when switching between column browser selections.
- [ ] **Remember column browser selections** — Persist genre/artist/album selections in localStorage (widths and sort prefs already persisted).
- [ ] **Inline metadata editing** — Edit tags directly in the track table without switching to Metadata tab.
- [ ] **Unified search** — Dedicated results view with advanced query syntax (backend exists, frontend incomplete).
- [ ] **Alphabet scroll on album grid** — Vertical hovering alphabet scroll to quickly jump to albums by letter (the `AlphabetScroller` atom exists; wire it into the grid).

### Performance
- [ ] **`sort_by_cached_key` in browser aggregates** — `library/queries/browser.rs` uses `sort_by_key` in 6 places, re-normalizing each Unicode name O(n log n) times per sort. Switch to `sort_by_cached_key` — one-line each, measurable on large libraries.
- [ ] **Shared `ureq::Agent` + timeouts** — Every HTTP call (MusicBrainz, Last.fm, LRCLIB, AcoustID) opens a fresh connection/TLS session and has no explicit timeout. Add one lazy shared `Agent` (in `network.rs`) with connection/read timeouts for keep-alive.
- [ ] **Parallel AcoustID fingerprinting** — `acoustid.rs::identify_tracks` runs `fpcalc` serially; fingerprinting is CPU-bound and independent per file. Parallelize on a bounded rayon pool, keep the network lookup serial (mirrors `albumart/fixer.rs`).
- [ ] **`MbCache` own read connection** — The MusicBrainz cache shares the single writer `Mutex`, so cache hits serialize behind scans/saves during art-fixing. Give it a dedicated read connection (WAL allows concurrent readers).
- [ ] **`LIKE 'prefix%'` → `GLOB` / range** — `library/scan.rs` orphan-cleanup filters can't use the `file_path` index under default case-insensitive LIKE. Use `GLOB` or a range predicate.
- [ ] **Frontend render cascades** — `NowPlayingBar` subscribes to the 60fps playback clock at the top level, re-rendering the whole bar each frame (extract the time-dependent middle into a child); `usePanelVisibility` returns a fresh object each render (wrap in `useMemo`); `TrackTable` handlers list `tracks` in deps so they churn on every paginated fetch (hold `tracks` in a ref); `QueuePanel` is the one long list not virtualized.

### Distribution & reliability
- [ ] **macOS code-signing + notarization** — see [Recommended next](#recommended-next).
- [ ] **Panic hook + global frontend error handler** — No `std::panic::set_hook`, so a panic in a spawned thread (audio engine, watcher, subsonic) dies silently; the frontend has an `ErrorBoundary` but no `window.onerror`/`unhandledrejection` handler.
- [ ] **CI coverage gate + trigger on push** — CI runs `npm test` (no threshold) only on PRs to `main`; add a `vitest` coverage threshold, run `test:coverage`, and add a `push: [main]` trigger.
- [ ] **Tests for core state** — 12 of 24 React contexts (incl. `PlaybackContext`, `PlaylistContext`, `UndoContext`) and the privileged `disk/mount.rs` path have no tests.
- [ ] **Single-source version bump** — Version lives in three files (`package.json`, `Cargo.toml`, `tauri.conf.json`); consolidate into one script to avoid drift.

### Security
- [ ] **Rotate the Last.fm shared secret** — It's committed in `lastfm.rs` in a public repo. Rotate it and stop treating it as private, or proxy signed requests through a small server.
- [ ] **Subsonic default to localhost + Keychain** — Setting any non-default credentials currently auto-binds the server to `0.0.0.0` over plaintext HTTP, and the password is stored plaintext in SQLite. Default to `127.0.0.1`, require explicit opt-in for LAN exposure, and move the password to the macOS Keychain.
- [ ] **Tighten `assetProtocol.scope`** — Currently `["**"]` (whole filesystem); scope it to configured library/media roots.

### Architecture / cleanup
- [ ] **Thin out `save_metadata`** — The command handler in `commands/metadata.rs` carries real orchestration logic; move it into the `metadata/` domain module (commands should stay thin).
- [ ] **Split oversized files** — Over the ~500-line rule: `localvideo.rs`, `sanitize.rs`, `musicbrainz/mod.rs`, `commands/metadata.rs`; and frontend `usePlaybackEngine.ts` (685), `App.tsx` (644), `useLibraryData.ts` (635), `TrackTable.tsx`, and a handful of other templates.
- [ ] **Dedup rayon pool + rate-limiter boilerplate** — Three near-identical `OnceLock<ThreadPool>` blocks and three copies of the global rate limiter (MusicBrainz/Last.fm/AcoustID); extract shared helpers into `network.rs` / a `pool.rs`.
- [ ] **Subsonic newest/recent sort correctness** — `library/queries/browser.rs` fakes both with `year DESC` (a `TODO`); wire to `MAX(created_at)` / `MAX(last_played)`, which already exist.
- [ ] **Cache pruning** — `mb_cache` / `discover_cache` never delete stale rows; add periodic pruning on the existing weekly cadence.

### Infrastructure
- [ ] **Swift disk helper binary** — Replace `diskutil` text parsing in `disk/` with a small Swift CLI tool (`crate-disk-helper`) using `DiskArbitration.framework`. Gives event-driven USB detection (no polling), typed disk properties (no text parsing), and native mount/unmount without `sudo` password piping. Ship as a helper binary alongside the `.app`; the Swift tool outputs JSON, Rust deserializes with serde.
- [ ] **tauri-specta typed bridge** — Add `specta` + `tauri-specta` to auto-generate TypeScript types and invoke wrappers from Rust command signatures, eliminating manual type duplication across `src/types/*.ts` and Rust structs.
- [ ] **Sudo timeout** — Add a timeout to sudo operations in `disk/mount.rs` to prevent indefinite hangs.

### Quality / accessibility
- [ ] Add aria-labels to all icon-only buttons (play, stop, expand, close, etc.)
- [ ] Complete the WAI-ARIA tabs pattern — `aria-controls`/`role="tabpanel"` pairing and roving arrow-key navigation for the top tabs, tools sidebar, and settings.
- [ ] Use semantic HTML for dialogs (`role="dialog"`) and menus (`role="menuitem"`)
- [ ] Extract remaining inline prop interfaces to `types.ts` files
- [ ] Unify settings persistence — consolidate scattered localStorage, SQLite, and hardcoded values into a single config system
- [ ] Add retry/resume for failed long-running operations (sync, album art repair, etc.)

### Features
- [ ] **Listening stats view** — `play_count`, `last_played`, `rating`, and `flagged` are all schema'd and indexed; surface a "Top Played / Recently Played / Listening Stats" view (backend is ready at zero query cost).
- [ ] **Batch find-and-replace** in metadata tags
- [ ] **Folder structure normalization** — Flag/fix naming inconsistencies, preview renames as a diff.

### Audio Analysis
- [ ] Clipping detection, dynamic range scoring, loudness metering (LUFS)
- [ ] ReplayGain scanning
- [ ] Silence detection, mono/stereo verification

## License

MIT
