import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { invoke } from "@tauri-apps/api/core";
import { useRepairActions } from "./useRepairActions";
import type { TrackMetadata, MetadataSaveResult } from "../../../types/metadata";
import type { RepairReport, AlbumRepairReport, TrackIssue } from "./types";

const mockInvoke = vi.mocked(invoke);

const track: TrackMetadata = {
  file_path: "/music/song.flac",
  file_name: "song.flac",
  title: "Song",
  artist: "Artist",
  album: "Album",
  album_artist: null,
  sort_artist: null,
  sort_album_artist: null,
  track: 1,
  track_total: null,
  year: null,
  genre: null,
};

const issue: TrackIssue = {
  file_path: "/music/song.flac",
  kind: "YearMissing",
  severity: "Warning",
  field: "year",
  local_value: null,
  suggested_value: "2020",
  description: "Year missing",
};

const album: AlbumRepairReport = {
  artist: "Artist",
  album: "Album",
  folder_path: "/music",
  selected_release: null,
  alternative_releases: [],
  match_confidence: 0.9,
  track_matches: [{ local_track: track, mb_track: null, match_confidence: 0.9, issues: [issue] }],
  missing_tracks: [],
  issue_summary: { error_count: 0, warning_count: 1, info_count: 0 },
};

const report: RepairReport = {
  albums: [album],
  total_issues: { error_count: 0, warning_count: 1, info_count: 0 },
};

const makeHookArgs = () => ({
  tracks: [track],
  setPhase: vi.fn(),
  setError: vi.fn(),
  setSaveResult: vi.fn(),
  setSaveProgress: vi.fn(),
  startProgress: vi.fn(),
  finishProgress: vi.fn(),
  failProgress: vi.fn(),
  cancel: vi.fn().mockResolvedValue(undefined),
  refreshTracks: vi.fn().mockResolvedValue(undefined),
});

beforeEach(() => {
  mockInvoke.mockReset();
});

describe("useRepairActions", () => {
  it("starts with empty state", () => {
    const args = makeHookArgs();
    const { result } = renderHook(() =>
      useRepairActions(
        args.tracks,
        args.setPhase,
        args.setError,
        args.setSaveResult,
        args.setSaveProgress,
        args.startProgress,
        args.finishProgress,
        args.failProgress,
        args.cancel,
        args.refreshTracks,
      ),
    );
    expect(result.current.report).toBeNull();
    expect(result.current.acceptedFixes.size).toBe(0);
    expect(result.current.selectedAlbum).toBeNull();
    expect(result.current.totalAccepted).toBe(0);
  });

  it("startRepair calls repair_analyze and sets report", async () => {
    mockInvoke.mockResolvedValue(report);
    const args = makeHookArgs();
    const { result } = renderHook(() =>
      useRepairActions(
        args.tracks,
        args.setPhase,
        args.setError,
        args.setSaveResult,
        args.setSaveProgress,
        args.startProgress,
        args.finishProgress,
        args.failProgress,
        args.cancel,
        args.refreshTracks,
      ),
    );

    await act(async () => {
      await result.current.startRepair();
    });

    expect(mockInvoke).toHaveBeenCalledWith("repair_analyze", { tracks: [track] });
    expect(result.current.report).toEqual(report);
    expect(result.current.selectedAlbum).toBe("/music");
    expect(args.finishProgress).toHaveBeenCalledWith("Found 1 issues across 1 albums");
  });

  it("startRepair handles cancellation", async () => {
    mockInvoke.mockRejectedValue("Cancelled");
    const args = makeHookArgs();
    const { result } = renderHook(() =>
      useRepairActions(
        args.tracks,
        args.setPhase,
        args.setError,
        args.setSaveResult,
        args.setSaveProgress,
        args.startProgress,
        args.finishProgress,
        args.failProgress,
        args.cancel,
        args.refreshTracks,
      ),
    );

    await act(async () => {
      await result.current.startRepair();
    });

    expect(args.failProgress).toHaveBeenCalledWith("Lookup cancelled");
  });

  it("startRepair handles error", async () => {
    mockInvoke.mockRejectedValue("Network error");
    const args = makeHookArgs();
    const { result } = renderHook(() =>
      useRepairActions(
        args.tracks,
        args.setPhase,
        args.setError,
        args.setSaveResult,
        args.setSaveProgress,
        args.startProgress,
        args.finishProgress,
        args.failProgress,
        args.cancel,
        args.refreshTracks,
      ),
    );

    await act(async () => {
      await result.current.startRepair();
    });

    expect(args.setError).toHaveBeenCalledWith("Network error");
  });

  it("does nothing with empty tracks", async () => {
    const args = makeHookArgs();
    args.tracks = [];
    const { result } = renderHook(() =>
      useRepairActions(
        args.tracks,
        args.setPhase,
        args.setError,
        args.setSaveResult,
        args.setSaveProgress,
        args.startProgress,
        args.finishProgress,
        args.failProgress,
        args.cancel,
        args.refreshTracks,
      ),
    );

    await act(async () => {
      await result.current.startRepair();
    });

    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it("toggleFix adds and removes issue keys", async () => {
    mockInvoke.mockResolvedValue(report);
    const args = makeHookArgs();
    const { result } = renderHook(() =>
      useRepairActions(
        args.tracks,
        args.setPhase,
        args.setError,
        args.setSaveResult,
        args.setSaveProgress,
        args.startProgress,
        args.finishProgress,
        args.failProgress,
        args.cancel,
        args.refreshTracks,
      ),
    );

    const key = "/music/song.flac::YearMissing::year";
    act(() => result.current.toggleFix(key));
    expect(result.current.acceptedFixes.has(key)).toBe(true);
    expect(result.current.totalAccepted).toBe(1);

    act(() => result.current.toggleFix(key));
    expect(result.current.acceptedFixes.has(key)).toBe(false);
    expect(result.current.totalAccepted).toBe(0);
  });

  it("acceptAllForAlbum selects all fixable issues", async () => {
    mockInvoke.mockResolvedValue(report);
    const args = makeHookArgs();
    const { result } = renderHook(() =>
      useRepairActions(
        args.tracks,
        args.setPhase,
        args.setError,
        args.setSaveResult,
        args.setSaveProgress,
        args.startProgress,
        args.finishProgress,
        args.failProgress,
        args.cancel,
        args.refreshTracks,
      ),
    );

    await act(async () => {
      await result.current.startRepair();
    });

    act(() => result.current.acceptAllForAlbum(album));
    expect(result.current.totalAccepted).toBe(1);
  });

  it("clearAllForAlbum removes all fixes for album", async () => {
    mockInvoke.mockResolvedValue(report);
    const args = makeHookArgs();
    const { result } = renderHook(() =>
      useRepairActions(
        args.tracks,
        args.setPhase,
        args.setError,
        args.setSaveResult,
        args.setSaveProgress,
        args.startProgress,
        args.finishProgress,
        args.failProgress,
        args.cancel,
        args.refreshTracks,
      ),
    );

    await act(async () => {
      await result.current.startRepair();
    });

    act(() => result.current.acceptAllForAlbum(album));
    expect(result.current.totalAccepted).toBe(1);

    act(() => result.current.clearAllForAlbum(album));
    expect(result.current.totalAccepted).toBe(0);
  });

  it("handleAcceptAllRepairs selects all fixable across all albums", async () => {
    mockInvoke.mockResolvedValue(report);
    const args = makeHookArgs();
    const { result } = renderHook(() =>
      useRepairActions(
        args.tracks,
        args.setPhase,
        args.setError,
        args.setSaveResult,
        args.setSaveProgress,
        args.startProgress,
        args.finishProgress,
        args.failProgress,
        args.cancel,
        args.refreshTracks,
      ),
    );

    await act(async () => {
      await result.current.startRepair();
    });
    act(() => result.current.handleAcceptAllRepairs());
    expect(result.current.totalAccepted).toBe(1);
  });

  it("handleClearAllRepairs clears everything", async () => {
    mockInvoke.mockResolvedValue(report);
    const args = makeHookArgs();
    const { result } = renderHook(() =>
      useRepairActions(
        args.tracks,
        args.setPhase,
        args.setError,
        args.setSaveResult,
        args.setSaveProgress,
        args.startProgress,
        args.finishProgress,
        args.failProgress,
        args.cancel,
        args.refreshTracks,
      ),
    );

    await act(async () => {
      await result.current.startRepair();
    });
    act(() => result.current.handleAcceptAllRepairs());
    act(() => result.current.handleClearAllRepairs());
    expect(result.current.totalAccepted).toBe(0);
  });

  it("handleApplyRepairs saves accepted fixes", async () => {
    const saveResult: MetadataSaveResult = { total: 1, succeeded: 1, failed: 0, cancelled: false, errors: [] };
    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === "repair_analyze") return report;
      if (cmd === "save_metadata") return saveResult;
      return undefined;
    });
    const args = makeHookArgs();
    const { result } = renderHook(() =>
      useRepairActions(
        args.tracks,
        args.setPhase,
        args.setError,
        args.setSaveResult,
        args.setSaveProgress,
        args.startProgress,
        args.finishProgress,
        args.failProgress,
        args.cancel,
        args.refreshTracks,
      ),
    );

    await act(async () => {
      await result.current.startRepair();
    });
    act(() => result.current.handleAcceptAllRepairs());
    await act(async () => {
      await result.current.handleApplyRepairs();
    });

    expect(mockInvoke).toHaveBeenCalledWith("save_metadata", {
      updates: [{ file_path: "/music/song.flac", year: 2020 }],
    });
    expect(args.refreshTracks).toHaveBeenCalled();
  });

  it("resetRepair clears everything", async () => {
    mockInvoke.mockResolvedValue(report);
    const args = makeHookArgs();
    const { result } = renderHook(() =>
      useRepairActions(
        args.tracks,
        args.setPhase,
        args.setError,
        args.setSaveResult,
        args.setSaveProgress,
        args.startProgress,
        args.finishProgress,
        args.failProgress,
        args.cancel,
        args.refreshTracks,
      ),
    );

    await act(async () => {
      await result.current.startRepair();
    });
    act(() => result.current.resetRepair());
    expect(result.current.report).toBeNull();
    expect(result.current.selectedAlbum).toBeNull();
    expect(result.current.totalAccepted).toBe(0);
  });
});
