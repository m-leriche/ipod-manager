import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useColumnOrder } from "./useColumnOrder";
import type { TrackTableColumn } from "./constants";

const STORAGE_KEY = "crate-column-order";

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
    key: "album",
    label: "Album",
    sortKey: "album",
    align: "left",
    def: { key: "album", minWidth: 80, initialWidth: 200 },
  },
];

beforeEach(() => {
  localStorage.clear();
});

describe("useColumnOrder", () => {
  it("initializes with default column order", () => {
    const { result } = renderHook(() => useColumnOrder(columns));
    expect(result.current.orderedColumns.map((c) => c.key)).toEqual(["title", "artist", "album"]);
  });

  it("persists order to localStorage", () => {
    renderHook(() => useColumnOrder(columns));
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    expect(stored).toEqual(["title", "artist", "album"]);
  });

  it("restores order from localStorage", () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(["album", "title", "artist"]));
    const { result } = renderHook(() => useColumnOrder(columns));
    expect(result.current.orderedColumns.map((c) => c.key)).toEqual(["album", "title", "artist"]);
  });

  it("falls back to default if localStorage has wrong keys", () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(["title", "artist", "nonexistent"]));
    const { result } = renderHook(() => useColumnOrder(columns));
    expect(result.current.orderedColumns.map((c) => c.key)).toEqual(["title", "artist", "album"]);
  });

  it("falls back to default if localStorage has wrong count", () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(["title", "artist"]));
    const { result } = renderHook(() => useColumnOrder(columns));
    expect(result.current.orderedColumns.map((c) => c.key)).toEqual(["title", "artist", "album"]);
  });

  it("falls back to default if localStorage has invalid JSON", () => {
    localStorage.setItem(STORAGE_KEY, "not-json");
    const { result } = renderHook(() => useColumnOrder(columns));
    expect(result.current.orderedColumns.map((c) => c.key)).toEqual(["title", "artist", "album"]);
  });

  it("starts with no drag state", () => {
    const { result } = renderHook(() => useColumnOrder(columns));
    expect(result.current.dragIndex).toBeNull();
    expect(result.current.dragOverIndex).toBeNull();
  });

  it("onReorderStart ignores non-left clicks", () => {
    const { result } = renderHook(() => useColumnOrder(columns));
    const event = { button: 2, clientX: 0, preventDefault: vi.fn() } as unknown as React.MouseEvent;
    act(() => result.current.onReorderStart(0, event));
    expect(event.preventDefault).not.toHaveBeenCalled();
  });
});
