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

  it("toggles a column on and persists it", () => {
    const { result } = renderHook(() => useColumnVisibility(columns));
    act(() => result.current.toggleColumnVisibility("bitrate"));
    expect(result.current.visibleKeys.has("bitrate")).toBe(true);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)).toContain("bitrate");
  });

  it("toggles a column off", () => {
    const { result } = renderHook(() => useColumnVisibility(columns));
    act(() => result.current.toggleColumnVisibility("artist"));
    expect(result.current.visibleKeys.has("artist")).toBe(false);
  });

  it("never hides the title column", () => {
    const { result } = renderHook(() => useColumnVisibility(columns));
    act(() => result.current.toggleColumnVisibility("title"));
    expect(result.current.visibleKeys.has("title")).toBe(true);
  });

  it("restores saved visibility, dropping unknown keys", () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(["title", "bitrate", "removed_column"]));
    const { result } = renderHook(() => useColumnVisibility(columns));
    expect([...result.current.visibleKeys].sort()).toEqual(["bitrate", "title"]);
  });
});
