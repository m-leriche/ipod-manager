import { SidebarNavItem } from "../../molecules/SidebarNavItem/SidebarNavItem";
import type { LibraryViewType } from "../../../types/library";

interface LibrarySidebarProps {
  activeView: LibraryViewType;
  onViewChange: (view: LibraryViewType) => void;
  trackCount: number;
  artistCount: number;
  albumCount: number;
  genreCount: number;
  search: string;
  onSearchChange: (search: string) => void;
  onAddFolder: () => void;
}

export const LibrarySidebar = ({
  activeView,
  onViewChange,
  trackCount,
  artistCount,
  albumCount,
  genreCount,
  search,
  onSearchChange,
  onAddFolder,
}: LibrarySidebarProps) => (
  <div className="w-[200px] shrink-0 border-r border-border flex flex-col bg-bg-secondary">
    {/* Search */}
    <div className="p-3">
      <input
        type="text"
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
        placeholder="Search library..."
        className="w-full px-3 py-1.5 bg-bg-card border border-border rounded-lg text-[11px] text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-border-active"
      />
    </div>

    {/* Navigation */}
    <div className="px-3 pb-2">
      <div className="text-[9px] font-medium uppercase tracking-widest text-text-tertiary px-3 mb-1.5">Library</div>
      <div className="flex flex-col gap-0.5">
        <SidebarNavItem
          label="All Tracks"
          icon={<TrackIcon />}
          isActive={activeView === "tracks"}
          onClick={() => onViewChange("tracks")}
          count={trackCount}
        />
        <SidebarNavItem
          label="Artists"
          icon={<ArtistIcon />}
          isActive={activeView === "artists"}
          onClick={() => onViewChange("artists")}
          count={artistCount}
        />
        <SidebarNavItem
          label="Albums"
          icon={<AlbumIcon />}
          isActive={activeView === "albums"}
          onClick={() => onViewChange("albums")}
          count={albumCount}
        />
        <SidebarNavItem
          label="Genres"
          icon={<GenreIcon />}
          isActive={activeView === "genres"}
          onClick={() => onViewChange("genres")}
          count={genreCount}
        />
      </div>
    </div>

    <div className="flex-1" />

    {/* Add Folder */}
    <div className="p-3 border-t border-border">
      <button
        onClick={onAddFolder}
        className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-[11px] font-medium text-text-secondary border border-border hover:text-text-primary hover:border-border-active transition-all"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-3.5 h-3.5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
        </svg>
        Add Folder
      </button>
    </div>
  </div>
);

const TrackIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-full h-full">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"
    />
  </svg>
);

const ArtistIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-full h-full">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
    />
  </svg>
);

const AlbumIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-full h-full">
    <circle cx="12" cy="12" r="10" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

const GenreIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-full h-full">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"
    />
  </svg>
);
