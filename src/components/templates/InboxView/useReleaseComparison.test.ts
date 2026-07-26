import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { invoke } from "@tauri-apps/api/core";
import { useReleaseComparison } from "./useReleaseComparison";
import type { InboxAlbum, ReleaseComparison } from "./types";

const mockInvoke = vi.mocked(invoke);

const album: InboxAlbum = {
  folder_path: "/inbox/Melted",
  folder_name: "Melted",
  artist: "Ty Segall",
  album: "Melted",
  year: 2010,
  tracks: [],
  checks: {
    tags: { status: "pass", detail: null },
    cover: { status: "pass", detail: null },
    tracklist: { status: "fail", detail: null },
    duplicate: { status: "pass", detail: null },
  },
};

const named = (title: string): ReleaseComparison => ({
  query_artist: "Ty Segall",
  query_album: "Melted",
  detail: {
    release: {
      id: title,
      title,
      artist: "Ty Segall",
      date: "2010",
      disambiguation: null,
      track_count: 0,
      score: 100,
    },
    media: [],
    tracks: [],
  },
  alternatives: [],
});

/**
 * Mounts the hook with its first lookup left in flight, then completes a second
 * one — the ordering the MusicBrainz rate limit makes possible.
 */
const withOverlappingLookups = async (first: "resolves" | "fails") => {
  let settleFirst = () => {};
  mockInvoke
    .mockImplementationOnce(
      () =>
        new Promise<ReleaseComparison>((resolve, reject) => {
          settleFirst = first === "resolves" ? () => resolve(named("first")) : () => reject("rate limited");
        }),
    )
    .mockResolvedValue(named("second"));

  const { result } = renderHook(() => useReleaseComparison(album));
  await waitFor(() => expect(mockInvoke).toHaveBeenCalledTimes(1));
  await act(() => result.current.reload("second"));

  return { result, settleFirst };
};

describe("useReleaseComparison", () => {
  beforeEach(() => {
    mockInvoke.mockReset();
  });

  it("keeps the newest lookup when an earlier one resolves late", async () => {
    const { result, settleFirst } = await withOverlappingLookups("resolves");

    expect(result.current.comparison?.detail.release.title).toBe("second");

    await act(async () => settleFirst());

    expect(result.current.comparison?.detail.release.title).toBe("second");
    expect(result.current.loading).toBe(false);
  });

  it("keeps the newest lookup when an earlier one fails late", async () => {
    const { result, settleFirst } = await withOverlappingLookups("fails");

    await act(async () => settleFirst());

    expect(result.current.error).toBeNull();
    expect(result.current.comparison?.detail.release.title).toBe("second");
  });

  it("skips the lookup for an album with no artist or album tag", async () => {
    renderHook(() => useReleaseComparison({ ...album, artist: null, album: null }));

    await waitFor(() => expect(mockInvoke).not.toHaveBeenCalled());
  });
});
