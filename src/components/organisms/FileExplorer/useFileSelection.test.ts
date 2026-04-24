import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useFileSelection } from "./useFileSelection";
import type { FileEntry } from "./types";

const makeEntry = (name: string, is_dir = false): FileEntry => ({
  name,
  is_dir,
  size: 100,
  modified: 0,
});

const entries: FileEntry[] = [
  makeEntry("alpha.txt"),
  makeEntry("beta.txt"),
  makeEntry("gamma.txt"),
  makeEntry("delta.txt"),
];

describe("useFileSelection", () => {
  it("starts with empty selection", () => {
    const { result } = renderHook(() => useFileSelection(entries));
    expect(result.current.selected.size).toBe(0);
  });

  it("single click selects one item", () => {
    const { result } = renderHook(() => useFileSelection(entries));
    act(() => result.current.handleClick("beta.txt", { metaKey: false, shiftKey: false }));
    expect(result.current.isSelected("beta.txt")).toBe(true);
    expect(result.current.selected.size).toBe(1);
  });

  it("single click replaces previous selection", () => {
    const { result } = renderHook(() => useFileSelection(entries));
    act(() => result.current.handleClick("alpha.txt", { metaKey: false, shiftKey: false }));
    act(() => result.current.handleClick("gamma.txt", { metaKey: false, shiftKey: false }));
    expect(result.current.isSelected("alpha.txt")).toBe(false);
    expect(result.current.isSelected("gamma.txt")).toBe(true);
    expect(result.current.selected.size).toBe(1);
  });

  it("meta+click toggles individual items", () => {
    const { result } = renderHook(() => useFileSelection(entries));
    act(() => result.current.handleClick("alpha.txt", { metaKey: true, shiftKey: false }));
    act(() => result.current.handleClick("gamma.txt", { metaKey: true, shiftKey: false }));
    expect(result.current.isSelected("alpha.txt")).toBe(true);
    expect(result.current.isSelected("gamma.txt")).toBe(true);
    expect(result.current.selected.size).toBe(2);

    // Toggle off
    act(() => result.current.handleClick("alpha.txt", { metaKey: true, shiftKey: false }));
    expect(result.current.isSelected("alpha.txt")).toBe(false);
    expect(result.current.selected.size).toBe(1);
  });

  it("shift+click selects a range", () => {
    const { result } = renderHook(() => useFileSelection(entries));
    act(() => result.current.handleClick("alpha.txt", { metaKey: false, shiftKey: false }));
    act(() => result.current.handleClick("gamma.txt", { metaKey: false, shiftKey: true }));
    expect(result.current.isSelected("alpha.txt")).toBe(true);
    expect(result.current.isSelected("beta.txt")).toBe(true);
    expect(result.current.isSelected("gamma.txt")).toBe(true);
    expect(result.current.selected.size).toBe(3);
  });

  it("shift+click works in reverse direction", () => {
    const { result } = renderHook(() => useFileSelection(entries));
    act(() => result.current.handleClick("gamma.txt", { metaKey: false, shiftKey: false }));
    act(() => result.current.handleClick("alpha.txt", { metaKey: false, shiftKey: true }));
    expect(result.current.isSelected("alpha.txt")).toBe(true);
    expect(result.current.isSelected("beta.txt")).toBe(true);
    expect(result.current.isSelected("gamma.txt")).toBe(true);
    expect(result.current.selected.size).toBe(3);
  });

  it("meta+shift+click extends range while keeping existing selection", () => {
    const { result } = renderHook(() => useFileSelection(entries));
    act(() => result.current.handleClick("delta.txt", { metaKey: true, shiftKey: false }));
    act(() => result.current.handleClick("alpha.txt", { metaKey: false, shiftKey: false }));
    act(() => result.current.handleClick("beta.txt", { metaKey: true, shiftKey: true }));
    // With meta+shift, it should keep "alpha" from previous lastClicked range and add the shift range
    expect(result.current.isSelected("alpha.txt")).toBe(true);
    expect(result.current.isSelected("beta.txt")).toBe(true);
  });

  it("selectAll selects everything", () => {
    const { result } = renderHook(() => useFileSelection(entries));
    act(() => result.current.selectAll());
    expect(result.current.selected.size).toBe(4);
    entries.forEach((e) => expect(result.current.isSelected(e.name)).toBe(true));
  });

  it("clearSelection empties selection", () => {
    const { result } = renderHook(() => useFileSelection(entries));
    act(() => result.current.selectAll());
    act(() => result.current.clearSelection());
    expect(result.current.selected.size).toBe(0);
  });

  it("resets selection when entries change", () => {
    const { result, rerender } = renderHook(({ e }) => useFileSelection(e), {
      initialProps: { e: entries },
    });
    act(() => result.current.handleClick("alpha.txt", { metaKey: false, shiftKey: false }));
    expect(result.current.selected.size).toBe(1);

    const newEntries = [makeEntry("new.txt")];
    rerender({ e: newEntries });
    expect(result.current.selected.size).toBe(0);
  });
});
