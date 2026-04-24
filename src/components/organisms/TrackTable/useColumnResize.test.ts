import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useColumnResize, type ColumnDef } from "./useColumnResize";

const STORAGE_KEY = "crate-column-widths";

const columns: ColumnDef[] = [
  { key: "title", minWidth: 100, initialWidth: 280 },
  { key: "artist", minWidth: 80, initialWidth: 200 },
  { key: "album", minWidth: 80, initialWidth: 200 },
];

beforeEach(() => {
  localStorage.clear();
});

describe("useColumnResize", () => {
  it("initializes with default widths", () => {
    const { result } = renderHook(() => useColumnResize(columns));
    expect(result.current.widths).toEqual([280, 200, 200]);
  });

  it("persists widths to localStorage", () => {
    renderHook(() => useColumnResize(columns));
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    expect(stored).toEqual({ title: 280, artist: 200, album: 200 });
  });

  it("restores widths from localStorage", () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ title: 300, artist: 150, album: 250 }));
    const { result } = renderHook(() => useColumnResize(columns));
    expect(result.current.widths).toEqual([300, 150, 250]);
  });

  it("uses initialWidth for missing keys in localStorage", () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ title: 300 }));
    const { result } = renderHook(() => useColumnResize(columns));
    expect(result.current.widths).toEqual([300, 200, 200]);
  });

  it("falls back to defaults on invalid JSON", () => {
    localStorage.setItem(STORAGE_KEY, "bad-json");
    const { result } = renderHook(() => useColumnResize(columns));
    expect(result.current.widths).toEqual([280, 200, 200]);
  });

  it("onResizeStart respects minWidth", () => {
    const { result } = renderHook(() => useColumnResize(columns));

    const preventDefault = vi.fn();
    const stopPropagation = vi.fn();
    const event = {
      clientX: 200,
      preventDefault,
      stopPropagation,
    } as unknown as React.MouseEvent;

    act(() => result.current.onResizeStart(0, event));
    expect(preventDefault).toHaveBeenCalled();
    expect(stopPropagation).toHaveBeenCalled();

    // Simulate dragging far left (below minWidth)
    act(() => {
      window.dispatchEvent(new MouseEvent("mousemove", { clientX: 0 }));
    });

    // Width should be clamped to minWidth (100)
    expect(result.current.widths[0]).toBe(100);

    // Complete the drag
    act(() => {
      window.dispatchEvent(new MouseEvent("mouseup"));
    });
  });

  it("onResizeStart applies positive delta", () => {
    const { result } = renderHook(() => useColumnResize(columns));

    const event = {
      clientX: 200,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    } as unknown as React.MouseEvent;

    act(() => result.current.onResizeStart(1, event));

    // Drag 50px to the right
    act(() => {
      window.dispatchEvent(new MouseEvent("mousemove", { clientX: 250 }));
    });

    expect(result.current.widths[1]).toBe(250); // 200 + 50

    act(() => {
      window.dispatchEvent(new MouseEvent("mouseup"));
    });
  });
});
