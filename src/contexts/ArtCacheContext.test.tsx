import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { listen } from "@tauri-apps/api/event";

vi.unmock("./ArtCacheContext");
import { ArtCacheProvider, useArtCache } from "./ArtCacheContext";

const wrapper = ({ children }: { children: React.ReactNode }) => <ArtCacheProvider>{children}</ArtCacheProvider>;

describe("ArtCacheContext", () => {
  it("initial artCacheBust is 0", () => {
    const { result } = renderHook(() => useArtCache(), { wrapper });
    expect(result.current.artCacheBust).toBe(0);
  });

  it("bumpArtCache() increments the counter", () => {
    const { result } = renderHook(() => useArtCache(), { wrapper });

    act(() => {
      result.current.bumpArtCache();
    });

    expect(result.current.artCacheBust).toBe(1);
  });

  it("multiple bumps increment correctly", () => {
    const { result } = renderHook(() => useArtCache(), { wrapper });

    act(() => {
      result.current.bumpArtCache();
      result.current.bumpArtCache();
      result.current.bumpArtCache();
    });

    expect(result.current.artCacheBust).toBe(3);
  });

  it("listens for 'album-art-fixed' Tauri events and dispatches DOM CustomEvent", async () => {
    // Capture the callback registered with listen()
    let capturedCallback: ((event: { payload: string }) => void) | null = null;
    vi.mocked(listen).mockImplementation(async (event: string, handler: unknown) => {
      if (event === "album-art-fixed") {
        capturedCallback = handler as (event: { payload: string }) => void;
      }
      return () => {};
    });

    const dispatchSpy = vi.spyOn(window, "dispatchEvent");

    renderHook(() => useArtCache(), { wrapper });

    // Wait for the listen promise to resolve
    await act(async () => {});

    expect(vi.mocked(listen)).toHaveBeenCalledWith("album-art-fixed", expect.any(Function));
    expect(capturedCallback).not.toBeNull();

    // Simulate the Tauri event firing
    act(() => {
      capturedCallback!({ payload: "/path/to/album" });
    });

    expect(dispatchSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "album-art-fixed",
        detail: "/path/to/album",
      }),
    );

    dispatchSpy.mockRestore();
  });
});
