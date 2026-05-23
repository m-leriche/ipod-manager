import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { usePanelVisibility } from "./usePanelVisibility";

beforeEach(() => {
  localStorage.clear();
});

describe("usePanelVisibility", () => {
  it("has correct defaults when localStorage is empty", () => {
    const { result } = renderHook(() => usePanelVisibility());

    // Defaults that use !== "false" (on by default)
    expect(result.current.showColumnBrowser).toBe(true);
    expect(result.current.showInfoPanel).toBe(true);
    expect(result.current.showPlaylistSidebar).toBe(true);
    expect(result.current.showTrackList).toBe(true);

    // Defaults that use === "true" (off by default)
    expect(result.current.showStatsPanel).toBe(false);
    expect(result.current.showAlbumGrid).toBe(false);
    expect(result.current.showLyricsPanel).toBe(false);
    expect(result.current.showArtworkCarousel).toBe(false);
    expect(result.current.lyricsOverlay).toBe(false);
  });

  it("restores state from localStorage", () => {
    localStorage.setItem("crate-show-column-browser", "false");
    localStorage.setItem("crate-show-stats-panel", "true");
    localStorage.setItem("crate-show-album-grid", "true");

    const { result } = renderHook(() => usePanelVisibility());

    expect(result.current.showColumnBrowser).toBe(false);
    expect(result.current.showStatsPanel).toBe(true);
    expect(result.current.showAlbumGrid).toBe(true);
  });

  // ── Mutual-exclusion: column browser / album grid / artwork carousel ──

  it("toggleAlbumGrid ON disables column browser and artwork carousel", () => {
    const { result } = renderHook(() => usePanelVisibility());

    expect(result.current.showColumnBrowser).toBe(true);
    expect(result.current.showAlbumGrid).toBe(false);

    act(() => result.current.toggleAlbumGrid());

    expect(result.current.showAlbumGrid).toBe(true);
    expect(result.current.showColumnBrowser).toBe(false);
    expect(result.current.showArtworkCarousel).toBe(false);
    expect(localStorage.getItem("crate-show-album-grid")).toBe("true");
    expect(localStorage.getItem("crate-show-column-browser")).toBe("false");
  });

  it("toggleAlbumGrid OFF re-enables column browser", () => {
    localStorage.setItem("crate-show-album-grid", "true");
    localStorage.setItem("crate-show-column-browser", "false");

    const { result } = renderHook(() => usePanelVisibility());
    expect(result.current.showAlbumGrid).toBe(true);

    act(() => result.current.toggleAlbumGrid());

    expect(result.current.showAlbumGrid).toBe(false);
    expect(result.current.showColumnBrowser).toBe(true);
    expect(localStorage.getItem("crate-show-column-browser")).toBe("true");
  });

  it("toggleArtworkCarousel ON disables column browser and album grid", () => {
    const { result } = renderHook(() => usePanelVisibility());

    act(() => result.current.toggleArtworkCarousel());

    expect(result.current.showArtworkCarousel).toBe(true);
    expect(result.current.showColumnBrowser).toBe(false);
    expect(result.current.showAlbumGrid).toBe(false);
    expect(localStorage.getItem("crate-show-artwork-carousel")).toBe("true");
    expect(localStorage.getItem("crate-show-column-browser")).toBe("false");
    expect(localStorage.getItem("crate-show-album-grid")).toBe("false");
  });

  it("toggleArtworkCarousel OFF re-enables column browser", () => {
    localStorage.setItem("crate-show-artwork-carousel", "true");
    localStorage.setItem("crate-show-column-browser", "false");

    const { result } = renderHook(() => usePanelVisibility());

    act(() => result.current.toggleArtworkCarousel());

    expect(result.current.showArtworkCarousel).toBe(false);
    expect(result.current.showColumnBrowser).toBe(true);
  });

  it("toggleColumnBrowser when album grid is ON switches to column browser", () => {
    localStorage.setItem("crate-show-album-grid", "true");
    localStorage.setItem("crate-show-column-browser", "false");

    const { result } = renderHook(() => usePanelVisibility());
    expect(result.current.showAlbumGrid).toBe(true);
    expect(result.current.showColumnBrowser).toBe(false);

    act(() => result.current.toggleColumnBrowser());

    expect(result.current.showColumnBrowser).toBe(true);
    expect(result.current.showAlbumGrid).toBe(false);
    expect(result.current.showArtworkCarousel).toBe(false);
  });

  it("toggleColumnBrowser when nothing else is active toggles it", () => {
    const { result } = renderHook(() => usePanelVisibility());
    expect(result.current.showColumnBrowser).toBe(true);

    act(() => result.current.toggleColumnBrowser());
    expect(result.current.showColumnBrowser).toBe(false);

    act(() => result.current.toggleColumnBrowser());
    expect(result.current.showColumnBrowser).toBe(true);
  });

  // ── Lyrics ──

  it("dismissLyricsOverlay turns off both overlay and panel", () => {
    localStorage.setItem("crate-show-lyrics-panel", "true");
    localStorage.setItem("crate-lyrics-overlay", "true");

    const { result } = renderHook(() => usePanelVisibility());
    expect(result.current.showLyricsPanel).toBe(true);
    expect(result.current.lyricsOverlay).toBe(true);

    act(() => result.current.dismissLyricsOverlay());

    expect(result.current.showLyricsPanel).toBe(false);
    expect(result.current.lyricsOverlay).toBe(false);
    expect(localStorage.getItem("crate-show-lyrics-panel")).toBe("false");
    expect(localStorage.getItem("crate-lyrics-overlay")).toBe("false");
  });

  // ── Simple toggles persist to localStorage ──

  it("toggleInfoPanel persists to localStorage", () => {
    const { result } = renderHook(() => usePanelVisibility());
    expect(result.current.showInfoPanel).toBe(true);

    act(() => result.current.toggleInfoPanel());

    expect(result.current.showInfoPanel).toBe(false);
    expect(localStorage.getItem("crate-show-info-panel")).toBe("false");
  });
});
