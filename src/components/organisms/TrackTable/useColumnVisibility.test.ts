import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useColumnVisibility } from "./useColumnVisibility";
import type { TrackTableColumn } from "./constants";

const STORAGE_KEY = "crate-column-visibility";

const columns: TrackTableColumn[] = [
  {
    key: "title",
    label: "Title",
    sortKey: "title",
    align: "left",
    def: { key: "title", minWidth: 100, initialWidth: 280 },
  },
  {
    key: "artist",
    label: "Artist",
    sortKey: "artist",
    align: "left",
    def: { key: "artist", minWidth: 80, initialWidth: 200 },
  },
  {
    key: "bitrate",
    label: "Bitrate",
    sortKey: "bitrate",
    align: "right",
    def: { key: "bitrate", minWidth: 55, initialWidth: 75 },
    defaultHidden: true,
  },
];

beforeEach(() => {
  localStorage.clear();
});

describe("useColumnVisibility", () => {
  it("defaults to non-hidden columns", () => {
    const { result } = renderHook(() => useColumnVisibility(columns));
    expect([...result.current.visibleKeys].sort()).toEqual(["artist", "title"]);
  });

  it("toggles a column on and persists the override", () => {
    const { result } = renderHook(() => useColumnVisibility(columns));
    act(() => result.current.toggleColumnVisibility("bitrate"));
    expect(result.current.visibleKeys.has("bitrate")).toBe(true);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)).toEqual({ bitrate: true });
  });

  it("toggles a column off", () => {
    const { result } = renderHook(() => useColumnVisibility(columns));
    act(() => result.current.toggleColumnVisibility("artist"));
    expect(result.current.visibleKeys.has("artist")).toBe(false);
  });

  it("never hides the title column, even via corrupted settings", () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ title: false }));
    const { result } = renderHook(() => useColumnVisibility(columns));
    expect(result.current.visibleKeys.has("title")).toBe(true);
    act(() => result.current.toggleColumnVisibility("title"));
    expect(result.current.visibleKeys.has("title")).toBe(true);
  });

  it("leaves columns without an override at their default", () => {
    // A user who saved overrides before a new default-visible column shipped
    // must still see it (the old array-based storage hid it).
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ bitrate: true }));
    const { result } = renderHook(() => useColumnVisibility(columns));
    expect(result.current.visibleKeys.has("artist")).toBe(true);
    expect(result.current.visibleKeys.has("bitrate")).toBe(true);
  });
});
