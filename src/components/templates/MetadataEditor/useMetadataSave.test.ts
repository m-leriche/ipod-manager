import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { UndoProvider } from "../../../contexts/UndoContext";
import { useMetadataSave } from "./useMetadataSave";
import { trackToEditable } from "./helpers";
import type { TrackMetadata, MetadataUpdate, MetadataSaveResult } from "../../../types/metadata";
import type { ToastAction } from "../../../contexts/ToastContext";

const mockInvoke = vi.mocked(invoke);

const track = (file_path: string, title: string): TrackMetadata => ({
  file_path,
  file_name: file_path.slice(1),
  title,
  artist: null,
  album: null,
  album_artist: null,
  sort_artist: null,
  sort_album_artist: null,
  track: null,
  track_total: null,
  disc_number: null,
  disc_total: null,
  year: null,
  genre: null,
});

const saveResult = (undo_operations: MetadataUpdate[]): MetadataSaveResult => ({
  total: 1,
  succeeded: 1,
  failed: 0,
  cancelled: false,
  errors: [],
  undo_operations,
});

const makeParams = (t: TrackMetadata, newTitle: string, onSaveToast: (m: string, a?: ToastAction) => void) => ({
  tracks: [t],
  editedTracks: { [t.file_path]: { ...trackToEditable(t), title: newTitle } },
  selected: new Set<string>(),
  selectedTracks: [],
  undoOperations: null as MetadataUpdate[] | null,
  setPhase: vi.fn(),
  setEditedTracks: vi.fn(),
  setTracks: vi.fn(),
  setSaveResult: vi.fn(),
  setSaveProgress: vi.fn(),
  setUndoOperations: vi.fn(),
  setError: vi.fn(),
  setRepairingArt: vi.fn(),
  setArtCacheBust: vi.fn(),
  bumpArtCache: vi.fn(),
  startProgress: vi.fn(),
  finishProgress: vi.fn(),
  failProgress: vi.fn(),
  cancel: vi.fn(),
  refreshTracks: vi.fn().mockResolvedValue(undefined),
  onSaveToast,
});

describe("useMetadataSave", () => {
  beforeEach(() => {
    mockInvoke.mockReset();
  });

  it("toast Undo reverts its own save, not a later one that overwrote the panel state", async () => {
    const opsA: MetadataUpdate[] = [{ file_path: "/a.mp3", title: "A old" }];
    const opsB: MetadataUpdate[] = [{ file_path: "/b.mp3", title: "B old" }];
    const onSaveToast = vi.fn();

    mockInvoke
      .mockResolvedValueOnce(saveResult(opsA)) // save A
      .mockResolvedValueOnce(saveResult(opsB)) // save B
      .mockResolvedValue(saveResult([])); // restore call

    const { result, rerender } = renderHook((p: ReturnType<typeof makeParams>) => useMetadataSave(p), {
      initialProps: makeParams(track("/a.mp3", "A old"), "A new", onSaveToast),
      wrapper: UndoProvider,
    });

    await act(async () => {
      await result.current.handleSave();
    });
    const toastActionA = onSaveToast.mock.calls[0][1] as ToastAction;

    // A second save overwrites the panel's live undo state (undoOperations = opsB)
    rerender({ ...makeParams(track("/b.mp3", "B old"), "B new", onSaveToast), undoOperations: opsB });
    await act(async () => {
      await result.current.handleSave();
    });

    // Clicking the *first* toast's Undo must revert set A, not the more recent set B
    await act(async () => {
      toastActionA.onClick();
    });

    expect(mockInvoke).toHaveBeenLastCalledWith("save_metadata", { updates: opsA });
  });
});
