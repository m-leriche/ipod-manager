import { useState, useRef, useEffect, useMemo } from "react";
import type { ArtistSummary } from "../../../types/library";

interface ArtistPickerProps {
  artists: ArtistSummary[];
  selectedArtist: string | null;
  onSelectArtist: (artist: string | null) => void;
}

export const ArtistPicker = ({ artists, selectedArtist, onSelectArtist }: ArtistPickerProps) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // Close on outside click / Escape
  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  // Focus search when opening, clear on close
  useEffect(() => {
    if (open && searchRef.current) searchRef.current.focus();
    if (!open) setSearch("");
  }, [open]);

  const filtered = useMemo(() => {
    if (!search) return artists;
    const q = search.toLowerCase();
    return artists.filter((a) => a.name.toLowerCase().includes(q));
  }, [artists, search]);

  const handleSelect = (name: string | null) => {
    onSelectArtist(name);
    setOpen(false);
  };

  const showSearch = artists.length > 15;

  return (
    <div ref={containerRef} className="absolute top-2 left-3 z-10">
      <button
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-medium backdrop-blur-sm transition-all ${
          open || selectedArtist ? "bg-white/15 text-white shadow-sm" : "bg-white/5 text-white/35 hover:text-white/55"
        }`}
      >
        <span className="truncate max-w-[140px]">{selectedArtist || "All Artists"}</span>
        <svg
          viewBox="0 0 10 6"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          className={`w-2 h-2 opacity-50 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        >
          <path d="M1 1l4 4 4-4" />
        </svg>
      </button>

      {open && (
        <div className="absolute top-full mt-1 left-0 w-52 rounded-lg bg-black/80 backdrop-blur-xl border border-white/[0.08] shadow-2xl overflow-hidden">
          {showSearch && (
            <div className="p-1.5 pb-0">
              <input
                ref={searchRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Filter artists…"
                className="w-full px-2.5 py-1.5 rounded-md bg-white/[0.06] text-white/80 text-[11px] placeholder:text-white/20 outline-none border border-white/[0.06] focus:border-white/15 transition-colors"
              />
            </div>
          )}
          <div className="overflow-y-auto max-h-64 p-1.5">
            <button
              onClick={() => handleSelect(null)}
              className={`w-full text-left px-2.5 py-1.5 rounded-md text-[11px] transition-colors ${
                !selectedArtist
                  ? "bg-white/10 text-white font-medium"
                  : "text-white/50 hover:text-white/80 hover:bg-white/[0.06]"
              }`}
            >
              All Artists
            </button>
            {filtered.map((artist) => (
              <button
                key={artist.name}
                onClick={() => handleSelect(artist.name)}
                className={`w-full text-left px-2.5 py-1.5 rounded-md text-[11px] flex items-center justify-between gap-2 transition-colors ${
                  selectedArtist === artist.name
                    ? "bg-white/10 text-white font-medium"
                    : "text-white/50 hover:text-white/80 hover:bg-white/[0.06]"
                }`}
              >
                <span className="truncate">{artist.name}</span>
                <span className="text-[9px] text-white/20 tabular-nums shrink-0">{artist.album_count}</span>
              </button>
            ))}
            {search && filtered.length === 0 && (
              <div className="px-2.5 py-3 text-[11px] text-white/25 text-center">No matches</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
