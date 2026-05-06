import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useFileSelection } from "./useFileSelection";

const ids = ["alpha.txt", "beta.txt", "gamma.txt", "delta.txt"];

describe("useFileSelection", () => {
  it("starts with empty selection", () => {
    const { result } = renderHook(() => useFileSelection(ids, "/test"));
    expect(result.current.selected.size).toBe(0);
  });

  it("single click selects one item", () => {
    const { result } = renderHook(() => useFileSelection(ids, "/test"));
    act(() => result.current.handleClick("beta.txt", { metaKey: false, shiftKey: false }));
    expect(result.current.isSelected("beta.txt")).toBe(true);
    expect(result.current.selected.size).toBe(1);
  });

  it("single click replaces previous selection", () => {
    const { result } = renderHook(() => useFileSelection(ids, "/test"));
    act(() => result.current.handleClick("alpha.txt", { metaKey: false, shiftKey: false }));
    act(() => result.current.handleClick("gamma.txt", { metaKey: false, shiftKey: false }));
    expect(result.current.isSelected("alpha.txt")).toBe(false);
    expect(result.current.isSelected("gamma.txt")).toBe(true);
    expect(result.current.selected.size).toBe(1);
  });

  it("meta+click toggles individual items", () => {
    const { result } = renderHook(() => useFileSelection(ids, "/test"));
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
    const { result } = renderHook(() => useFileSelection(ids, "/test"));
    act(() => result.current.handleClick("alpha.txt", { metaKey: false, shiftKey: false }));
    act(() => result.current.handleClick("gamma.txt", { metaKey: false, shiftKey: true }));
    expect(result.current.isSelected("alpha.txt")).toBe(true);
    expect(result.current.isSelected("beta.txt")).toBe(true);
    expect(result.current.isSelected("gamma.txt")).toBe(true);
    expect(result.current.selected.size).toBe(3);
  });

  it("shift+click works in reverse direction", () => {
    const { result } = renderHook(() => useFileSelection(ids, "/test"));
    act(() => result.current.handleClick("gamma.txt", { metaKey: false, shiftKey: false }));
    act(() => result.current.handleClick("alpha.txt", { metaKey: false, shiftKey: true }));
    expect(result.current.isSelected("alpha.txt")).toBe(true);
    expect(result.current.isSelected("beta.txt")).toBe(true);
    expect(result.current.isSelected("gamma.txt")).toBe(true);
    expect(result.current.selected.size).toBe(3);
  });

  it("meta+shift+click extends range while keeping existing selection", () => {
    const { result } = renderHook(() => useFileSelection(ids, "/test"));
    act(() => result.current.handleClick("delta.txt", { metaKey: true, shiftKey: false }));
    act(() => result.current.handleClick("alpha.txt", { metaKey: false, shiftKey: false }));
    act(() => result.current.handleClick("beta.txt", { metaKey: true, shiftKey: true }));
    expect(result.current.isSelected("alpha.txt")).toBe(true);
    expect(result.current.isSelected("beta.txt")).toBe(true);
  });

  it("selectAll selects everything", () => {
    const { result } = renderHook(() => useFileSelection(ids, "/test"));
    act(() => result.current.selectAll());
    expect(result.current.selected.size).toBe(4);
    ids.forEach((id) => expect(result.current.isSelected(id)).toBe(true));
  });

  it("clearSelection empties selection", () => {
    const { result } = renderHook(() => useFileSelection(ids, "/test"));
    act(() => result.current.selectAll());
    act(() => result.current.clearSelection());
    expect(result.current.selected.size).toBe(0);
  });

  it("resets selection when resetKey changes", () => {
    const { result, rerender } = renderHook(({ ids: i, key }) => useFileSelection(i, key), {
      initialProps: { ids, key: "/test" },
    });
    act(() => result.current.handleClick("alpha.txt", { metaKey: false, shiftKey: false }));
    expect(result.current.selected.size).toBe(1);

    rerender({ ids, key: "/other" });
    expect(result.current.selected.size).toBe(0);
  });
});
