import type { GenreSummary, ArtistSummary, AlbumSummary } from "../../../types/library";

interface ColumnBrowserProps {
  genres: GenreSummary[];
  artists: ArtistSummary[];
  albums: AlbumSummary[];
  selectedGenre: string | null;
  selectedArtist: string | null;
  selectedAlbum: string | null;
  onSelectGenre: (genre: string | null) => void;
  onSelectArtist: (artist: string | null) => void;
  onSelectAlbum: (album: string | null) => void;
}

export const ColumnBrowser = ({
  genres,
  artists,
  albums,
  selectedGenre,
  selectedArtist,
  selectedAlbum,
  onSelectGenre,
  onSelectArtist,
  onSelectAlbum,
}: ColumnBrowserProps) => (
  <div className="flex border-b border-border shrink-0" style={{ height: "35%" }}>
    {/* Genres column */}
    <BrowserColumn
      title="Genres"
      allLabel={`All Genres (${genres.length})`}
      items={genres.map((g) => ({ label: g.name, count: g.track_count }))}
      selected={selectedGenre}
      onSelect={onSelectGenre}
    />

    {/* Artists column */}
    <BrowserColumn
      title="Artists"
      allLabel={`All Artists (${artists.length})`}
      items={artists.map((a) => ({ label: a.name, count: a.track_count }))}
      selected={selectedArtist}
      onSelect={onSelectArtist}
    />

    {/* Albums column — key includes artist to disambiguate albums with the same name */}
    <BrowserColumn
      title="Albums"
      allLabel={`All Albums (${albums.length})`}
      items={albums.map((a) => ({ key: `${a.artist}::${a.name}`, label: a.name, count: a.track_count }))}
      selected={selectedAlbum}
      onSelect={onSelectAlbum}
      isLast
    />
  </div>
);

interface BrowserColumnProps {
  title: string;
  allLabel: string;
  items: { key?: string; label: string; count: number }[];
  selected: string | null;
  onSelect: (value: string | null) => void;
  isLast?: boolean;
}

const BrowserColumn = ({ title, allLabel, items, selected, onSelect, isLast }: BrowserColumnProps) => (
  <div className={`flex-1 min-w-0 flex flex-col ${isLast ? "" : "border-r border-border"}`}>
    <div className="px-3 py-1.5 border-b border-border bg-bg-secondary shrink-0">
      <span className="text-[10px] font-medium uppercase tracking-wider text-text-tertiary">{title}</span>
    </div>
    <div className="flex-1 overflow-y-auto">
      {/* "All" option */}
      <button
        onClick={() => onSelect(null)}
        className={`w-full text-left px-3 py-[5px] text-[11px] transition-colors ${
          selected === null ? "bg-accent text-white" : "text-text-primary hover:bg-bg-hover/50"
        }`}
      >
        {allLabel}
      </button>

      {items.map((item) => (
        <button
          key={item.key ?? item.label}
          onClick={() => onSelect(item.label)}
          className={`w-full text-left px-3 py-[5px] text-[11px] truncate transition-colors ${
            selected === item.label ? "bg-accent text-white" : "text-text-primary hover:bg-bg-hover/50"
          }`}
        >
          {item.label}
        </button>
      ))}
    </div>
  </div>
);
