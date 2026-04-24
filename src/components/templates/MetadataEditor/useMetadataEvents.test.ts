import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { listen } from "@tauri-apps/api/event";
import { useMetadataEvents } from "./useMetadataEvents";

const mockListen = vi.mocked(listen);

beforeEach(() => {
  mockListen.mockReset();
  mockListen.mockImplementation(() => Promise.resolve(() => {}));
});

describe("useMetadataEvents", () => {
  it("subscribes to all five event types", () => {
    const updateProgress = vi.fn();
    const setSaveProgress = vi.fn();
    renderHook(() => useMetadataEvents(updateProgress, setSaveProgress));

    const eventNames = mockListen.mock.calls.map((c) => c[0]);
    expect(eventNames).toContain("metadata-scan-progress");
    expect(eventNames).toContain("metadata-save-progress");
    expect(eventNames).toContain("sanitize-progress");
    expect(eventNames).toContain("repair-lookup-progress");
    expect(eventNames).toContain("quality-scan-progress");
    expect(eventNames).toEqual(
      expect.arrayContaining([
        "metadata-scan-progress",
        "metadata-save-progress",
        "sanitize-progress",
        "repair-lookup-progress",
        "quality-scan-progress",
      ]),
    );
  });

  it("forwards metadata-scan-progress to updateProgress", () => {
    const updateProgress = vi.fn();
    const setSaveProgress = vi.fn();
    renderHook(() => useMetadataEvents(updateProgress, setSaveProgress));

    const scanCall = mockListen.mock.calls.find((c) => c[0] === "metadata-scan-progress");
    const handler = scanCall![1] as (event: {
      payload: { completed: number; total: number; current_file: string };
    }) => void;
    handler({ payload: { completed: 5, total: 10, current_file: "song.flac" } });

    expect(updateProgress).toHaveBeenCalledWith(5, 10, "song.flac");
  });

  it("forwards metadata-save-progress to both callbacks", () => {
    const updateProgress = vi.fn();
    const setSaveProgress = vi.fn();
    renderHook(() => useMetadataEvents(updateProgress, setSaveProgress));

    const saveCall = mockListen.mock.calls.find((c) => c[0] === "metadata-save-progress");
    const handler = saveCall![1] as (event: {
      payload: { completed: number; total: number; current_file: string };
    }) => void;
    const payload = { completed: 3, total: 8, current_file: "track.mp3" };
    handler({ payload });

    expect(setSaveProgress).toHaveBeenCalledWith(payload);
    expect(updateProgress).toHaveBeenCalledWith(3, 8, "track.mp3");
  });

  it("forwards repair-lookup-progress with album fields", () => {
    const updateProgress = vi.fn();
    const setSaveProgress = vi.fn();
    renderHook(() => useMetadataEvents(updateProgress, setSaveProgress));

    const repairCall = mockListen.mock.calls.find((c) => c[0] === "repair-lookup-progress");
    const handler = repairCall![1] as (event: {
      payload: { completed_albums: number; total_albums: number; current_album: string };
    }) => void;
    handler({ payload: { completed_albums: 2, total_albums: 5, current_album: "Album X" } });

    expect(updateProgress).toHaveBeenCalledWith(2, 5, "Album X");
  });

  it("unsubscribes on unmount", async () => {
    const unsub1 = vi.fn();
    const unsub2 = vi.fn();
    const unsub3 = vi.fn();
    const unsub4 = vi.fn();
    const unsub5 = vi.fn();
    const unsubs = [unsub1, unsub2, unsub3, unsub4, unsub5];
    let idx = 0;
    mockListen.mockImplementation(() => Promise.resolve(unsubs[idx++]));

    const { unmount } = renderHook(() => useMetadataEvents(vi.fn(), vi.fn()));

    // Wait for all listen promises to resolve
    await vi.waitFor(() => expect(mockListen).toHaveBeenCalledTimes(5));

    unmount();
    unsubs.forEach((fn) => expect(fn).toHaveBeenCalled());
  });
});
