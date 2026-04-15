import type { ArtistSummary } from "../../../types/library";

interface ArtistListProps {
  artists: ArtistSummary[];
  selectedArtist: string | null;
  onSelectArtist: (artist: string) => void;
}

export const ArtistList = ({ artists, selectedArtist, onSelectArtist }: ArtistListProps) => {
  // Group by first letter
  const grouped = artists.reduce<Record<string, ArtistSummary[]>>((acc, artist) => {
    const letter = (artist.name[0] || "#").toUpperCase();
    const key = /[A-Z]/.test(letter) ? letter : "#";
    if (!acc[key]) acc[key] = [];
    acc[key].push(artist);
    return acc;
  }, {});

  const letters = Object.keys(grouped).sort((a, b) => {
    if (a === "#") return 1;
    if (b === "#") return -1;
    return a.localeCompare(b);
  });

  return (
    <div className="flex-1 min-h-0 overflow-y-auto">
      {artists.length === 0 ? (
        <div className="flex items-center justify-center h-48 text-text-tertiary text-xs">No artists found</div>
      ) : (
        letters.map((letter) => (
          <div key={letter}>
            <div className="sticky top-0 z-10 px-4 py-1 bg-bg-primary border-b border-border">
              <span className="text-[10px] font-semibold text-text-tertiary uppercase">{letter}</span>
            </div>
            {grouped[letter].map((artist) => (
              <button
                key={artist.name}
                onClick={() => onSelectArtist(artist.name)}
                className={`w-full flex items-center justify-between px-4 py-2.5 transition-colors ${
                  selectedArtist === artist.name ? "bg-accent/10" : "hover:bg-bg-hover/50"
                }`}
              >
                <div className="min-w-0">
                  <div className="text-xs font-medium text-text-primary truncate">{artist.name}</div>
                  <div className="text-[10px] text-text-tertiary">
                    {artist.album_count} album{artist.album_count !== 1 ? "s" : ""}
                    {" · "}
                    {artist.track_count} track{artist.track_count !== 1 ? "s" : ""}
                  </div>
                </div>
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  className="w-3 h-3 text-text-tertiary shrink-0"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </button>
            ))}
          </div>
        ))
      )}
    </div>
  );
};
