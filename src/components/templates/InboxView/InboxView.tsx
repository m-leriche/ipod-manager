import { useCallback } from "react";
import { emit } from "@tauri-apps/api/event";
import { Spinner } from "../../atoms/Spinner/Spinner";
import { InboxAlbumRow } from "./InboxAlbumRow";
import { isReady } from "./helpers";
import { useInboxActions } from "./useInboxActions";
import { useInboxData } from "./useInboxData";

export const InboxView = () => {
  const { location, albums, setAlbums, scanning, rescan } = useInboxData();

  const removeAlbums = useCallback(
    (folderPaths: string[]) => setAlbums((prev) => prev.filter((a) => !folderPaths.includes(a.folder_path))),
    [setAlbums],
  );
  const { fileAway, fileAll, convertAlbum, busy } = useInboxActions(removeAlbums, rescan);

  if (location === undefined) return null;

  if (!location) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 text-center px-8">
        <p className="text-xs text-text-secondary">No inbox folder configured.</p>
        <p className="text-[11px] text-text-tertiary max-w-md">
          Point Crate at the folder where new downloads land. Albums are checked for complete tags, cover art, a full
          tracklist, and duplicates before they can be filed into your library.
        </p>
        <button
          onClick={() => void emit("open-settings")}
          className="px-3 py-1.5 rounded-md text-[11px] font-medium bg-accent text-bg-primary hover:bg-accent-hover transition-colors"
        >
          Open Settings
        </button>
      </div>
    );
  }

  const ready = albums.filter(isReady);

  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="px-8 pb-3 shrink-0 flex items-center gap-3">
        <span className="text-[11px] text-text-tertiary truncate flex-1 min-w-0">{location}</span>
        {scanning && <Spinner />}
        <button
          onClick={() => void fileAll(ready)}
          disabled={busy || ready.length === 0}
          className="px-3 py-1.5 rounded-md text-[11px] font-medium bg-accent text-bg-primary hover:bg-accent-hover transition-colors disabled:opacity-50"
        >
          File All Passing ({ready.length})
        </button>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto px-8 pb-6 flex flex-col gap-3">
        {albums.length === 0 && !scanning ? (
          <p className="text-xs text-text-tertiary text-center py-12">Inbox is empty.</p>
        ) : (
          albums.map((album) => (
            <InboxAlbumRow
              key={album.folder_path}
              album={album}
              disabled={busy}
              onFileAway={fileAway}
              onConvert={convertAlbum}
            />
          ))
        )}
      </div>
    </div>
  );
};
