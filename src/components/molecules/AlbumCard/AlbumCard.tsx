import { AlbumArtwork } from "../../atoms/AlbumArtwork/AlbumArtwork";
import type { AlbumSummary } from "../../../types/library";

interface AlbumCardProps {
  album: AlbumSummary;
  onClick: () => void;
  onPlay: () => void;
}

export const AlbumCard = ({ album, onClick, onPlay }: AlbumCardProps) => (
  <button
    onClick={onClick}
    className="group text-left p-2.5 rounded-xl bg-bg-card border border-border hover:border-border-active transition-all"
  >
    <div className="relative mb-2.5">
      <AlbumArtwork folderPath={album.folder_path} size="lg" className="w-full h-auto aspect-square" />
      <div
        onClick={(e) => {
          e.stopPropagation();
          onPlay();
        }}
        className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
      >
        <div className="w-10 h-10 rounded-full bg-text-primary flex items-center justify-center">
          <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5 text-bg-primary ml-0.5">
            <path d="M8 5v14l11-7z" />
          </svg>
        </div>
      </div>
    </div>
    <div className="text-xs font-medium text-text-primary truncate">{album.name}</div>
    <div className="text-[11px] text-text-secondary truncate">{album.artist}</div>
    {album.year && <div className="text-[10px] text-text-tertiary mt-0.5">{album.year}</div>}
  </button>
);
