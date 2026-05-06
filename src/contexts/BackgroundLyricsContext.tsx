import { createContext, useContext, useState, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { ConfirmDialog } from "../components/atoms/ConfirmDialog/ConfirmDialog";

interface LyricsProgress {
  total: number;
  completed: number;
  current_track: string;
}

interface LyricsFetchResult {
  total: number;
  fetched: number;
  already_had: number;
  not_found: number;
  cancelled: boolean;
}

interface BackgroundLyricsState {
  active: boolean;
  total: number;
  completed: number;
  currentTrack: string;
}

interface BackgroundLyricsActions {
  state: BackgroundLyricsState;
  startFetch: () => void;
  cancelFetch: () => void;
}

const BackgroundLyricsContext = createContext<BackgroundLyricsActions>({
  state: { active: false, total: 0, completed: 0, currentTrack: "" },
  startFetch: () => {},
  cancelFetch: () => {},
});

export const BackgroundLyricsProvider = ({ children }: { children: React.ReactNode }) => {
  const [state, setState] = useState<BackgroundLyricsState>({
    active: false,
    total: 0,
    completed: 0,
    currentTrack: "",
  });
  const [result, setResult] = useState<LyricsFetchResult | null>(null);
  const activeRef = useRef(false);

  const startFetch = useCallback(async () => {
    if (activeRef.current) return;
    activeRef.current = true;
    setState({ active: true, total: 0, completed: 0, currentTrack: "Scanning library..." });

    const unlisten = await listen<LyricsProgress>("library-lyrics-progress", (e) => {
      setState({
        active: true,
        total: e.payload.total,
        completed: e.payload.completed,
        currentTrack: e.payload.current_track,
      });
    });

    try {
      const res = await invoke<LyricsFetchResult>("fetch_library_lyrics");
      setResult(res);
    } catch {
      setResult({
        total: 0,
        fetched: 0,
        already_had: 0,
        not_found: 0,
        cancelled: false,
      });
    } finally {
      unlisten();
      activeRef.current = false;
      setState({ active: false, total: 0, completed: 0, currentTrack: "" });
    }
  }, []);

  const cancelFetch = useCallback(() => {
    invoke("cancel_lyrics_fetch").catch(() => {});
  }, []);

  const dismissResult = useCallback(() => setResult(null), []);

  const formatResultMessage = (r: LyricsFetchResult): string => {
    if (r.cancelled) {
      const parts = ["Lyrics fetch was cancelled."];
      if (r.fetched > 0) parts.push(`${r.fetched} track${r.fetched !== 1 ? "s" : ""} fetched before cancellation.`);
      return parts.join(" ");
    }
    if (r.total === 0) {
      return "All tracks in your library already have lyrics.";
    }
    const parts: string[] = [];
    if (r.fetched > 0) parts.push(`${r.fetched} found`);
    if (r.not_found > 0) parts.push(`${r.not_found} not found`);
    if (parts.length === 0) return "No tracks needed lyrics.";
    return `Lyrics fetch complete \u2014 ${parts.join(", ")}.`;
  };

  return (
    <BackgroundLyricsContext.Provider value={{ state, startFetch, cancelFetch }}>
      {children}
      {result && (
        <ConfirmDialog
          title={result.cancelled ? "Fetch Cancelled" : "Lyrics Fetch"}
          message={formatResultMessage(result)}
          confirmLabel="OK"
          hideCancel
          onConfirm={dismissResult}
          onCancel={dismissResult}
        />
      )}
    </BackgroundLyricsContext.Provider>
  );
};

export const useBackgroundLyrics = (): BackgroundLyricsActions => useContext(BackgroundLyricsContext);
