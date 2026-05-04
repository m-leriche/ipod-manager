import { createContext, useContext, useState, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useArtCache } from "./ArtCacheContext";
import { ConfirmDialog } from "../components/atoms/ConfirmDialog/ConfirmDialog";

interface ArtRepairProgress {
  total: number;
  completed: number;
  current_album: string;
  phase: string;
}

interface ArtRepairResult {
  total: number;
  fixed: number;
  already_ok: number;
  failed: number;
  cancelled: boolean;
  errors: string[];
}

interface BackgroundArtRepairState {
  active: boolean;
  total: number;
  completed: number;
  currentAlbum: string;
}

interface BackgroundArtRepairActions {
  state: BackgroundArtRepairState;
  startRepair: () => void;
  cancelRepair: () => void;
}

const BackgroundArtRepairContext = createContext<BackgroundArtRepairActions>({
  state: { active: false, total: 0, completed: 0, currentAlbum: "" },
  startRepair: () => {},
  cancelRepair: () => {},
});

export const BackgroundArtRepairProvider = ({ children }: { children: React.ReactNode }) => {
  const { bumpArtCache } = useArtCache();
  const [state, setState] = useState<BackgroundArtRepairState>({
    active: false,
    total: 0,
    completed: 0,
    currentAlbum: "",
  });
  const [result, setResult] = useState<ArtRepairResult | null>(null);
  const activeRef = useRef(false);

  const startRepair = useCallback(async () => {
    if (activeRef.current) return;
    activeRef.current = true;
    setState({ active: true, total: 0, completed: 0, currentAlbum: "Scanning..." });

    const unlisten = await listen<ArtRepairProgress>("library-art-repair-progress", (e) => {
      setState({
        active: true,
        total: e.payload.total,
        completed: e.payload.completed,
        currentAlbum: e.payload.current_album,
      });
    });

    try {
      const res = await invoke<ArtRepairResult>("fix_library_album_art");
      setResult(res);
      bumpArtCache();
    } catch (e) {
      setResult({
        total: 0,
        fixed: 0,
        already_ok: 0,
        failed: 0,
        cancelled: false,
        errors: [`${e}`],
      });
    } finally {
      unlisten();
      activeRef.current = false;
      setState({ active: false, total: 0, completed: 0, currentAlbum: "" });
    }
  }, [bumpArtCache]);

  const cancelRepair = useCallback(() => {
    invoke("cancel_art_repair").catch(() => {});
  }, []);

  const dismissResult = useCallback(() => setResult(null), []);

  const formatResultMessage = (r: ArtRepairResult): string => {
    if (r.cancelled) {
      const parts = ["Album art repair was cancelled."];
      if (r.fixed > 0) parts.push(`${r.fixed} album${r.fixed !== 1 ? "s" : ""} fixed before cancellation.`);
      return parts.join(" ");
    }
    if (r.total === 0 && r.errors.length === 0) {
      return "All albums in your library already have artwork.";
    }
    const parts: string[] = [];
    if (r.fixed > 0) parts.push(`${r.fixed} fixed`);
    if (r.failed > 0) parts.push(`${r.failed} not found`);
    if (parts.length === 0) return "No albums needed repair.";
    return `Album art repair complete \u2014 ${parts.join(", ")}.`;
  };

  return (
    <BackgroundArtRepairContext.Provider value={{ state, startRepair, cancelRepair }}>
      {children}
      {result && (
        <ConfirmDialog
          title={result.cancelled ? "Repair Cancelled" : "Album Art Repair"}
          message={formatResultMessage(result)}
          confirmLabel="OK"
          hideCancel
          onConfirm={dismissResult}
          onCancel={dismissResult}
        />
      )}
    </BackgroundArtRepairContext.Provider>
  );
};

export const useBackgroundArtRepair = (): BackgroundArtRepairActions => useContext(BackgroundArtRepairContext);
