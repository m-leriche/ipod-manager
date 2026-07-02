import { useEffect, useRef } from "react";
import { isTextEntryTarget, matchesShortcut, RATING_ACTIONS } from "../../../utils/shortcuts";
import type { LibraryTrack } from "../../../types/library";

interface UseSelectionShortcutsOptions {
  /** Only fire while the library view is the active tab. */
  enabled: boolean;
  selectedTracks: LibraryTrack[];
  onRateTracks: (trackIds: number[], rating: number) => void;
  onFlagTracks: (trackIds: number[], flagged: boolean) => void;
}

/** Global shortcuts (default 1–5, 0, L) that rate, clear the rating of, or
    toggle the sync flag on the selected tracks. No-ops without a selection. */
export const useSelectionShortcuts = ({
  enabled,
  selectedTracks,
  onRateTracks,
  onFlagTracks,
}: UseSelectionShortcutsOptions) => {
  // Refs so the listener registers once and always sees current values
  const optionsRef = useRef({ enabled, selectedTracks, onRateTracks, onFlagTracks });
  optionsRef.current = { enabled, selectedTracks, onRateTracks, onFlagTracks };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isTextEntryTarget(e)) return;
      const { enabled, selectedTracks, onRateTracks, onFlagTracks } = optionsRef.current;
      if (!enabled || selectedTracks.length === 0) return;

      const ids = selectedTracks.map((t) => t.id);
      const ratingIndex = RATING_ACTIONS.findIndex((action) => matchesShortcut(e, action));
      if (ratingIndex !== -1) {
        e.preventDefault();
        onRateTracks(ids, ratingIndex + 1);
        return;
      }
      if (matchesShortcut(e, "clearRating")) {
        e.preventDefault();
        onRateTracks(ids, 0);
        return;
      }
      if (matchesShortcut(e, "toggleFlagTracks")) {
        e.preventDefault();
        onFlagTracks(ids, !selectedTracks.every((t) => t.flagged));
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);
};
