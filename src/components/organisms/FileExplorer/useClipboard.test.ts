import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useClipboard } from "./useClipboard";

describe("useClipboard", () => {
  it("starts with null clipboard", () => {
    const { result } = renderHook(() => useClipboard());
    expect(result.current.clipboard).toBeNull();
  });

  it("copy sets clipboard with copy operation", () => {
    const { result } = renderHook(() => useClipboard());
    act(() => result.current.copy(["/a/file.txt"], "/a"));
    expect(result.current.clipboard).toEqual({
      paths: ["/a/file.txt"],
      operation: "copy",
      sourceDir: "/a",
    });
  });

  it("cut sets clipboard with cut operation", () => {
    const { result } = renderHook(() => useClipboard());
    act(() => result.current.cut(["/a/file.txt", "/a/other.txt"], "/a"));
    expect(result.current.clipboard).toEqual({
      paths: ["/a/file.txt", "/a/other.txt"],
      operation: "cut",
      sourceDir: "/a",
    });
  });

  it("clear resets clipboard to null", () => {
    const { result } = renderHook(() => useClipboard());
    act(() => result.current.copy(["/a/file.txt"], "/a"));
    expect(result.current.clipboard).not.toBeNull();
    act(() => result.current.clear());
    expect(result.current.clipboard).toBeNull();
  });

  it("isCut returns true for cut file paths", () => {
    const { result } = renderHook(() => useClipboard());
    act(() => result.current.cut(["/a/file.txt", "/a/other.txt"], "/a"));
    expect(result.current.isCut("/a/file.txt")).toBe(true);
    expect(result.current.isCut("/a/other.txt")).toBe(true);
    expect(result.current.isCut("/a/unrelated.txt")).toBe(false);
  });

  it("isCut returns false for copy operations", () => {
    const { result } = renderHook(() => useClipboard());
    act(() => result.current.copy(["/a/file.txt"], "/a"));
    expect(result.current.isCut("/a/file.txt")).toBe(false);
  });

  it("isCut returns false when clipboard is empty", () => {
    const { result } = renderHook(() => useClipboard());
    expect(result.current.isCut("/a/file.txt")).toBe(false);
  });

  it("copy overwrites previous cut", () => {
    const { result } = renderHook(() => useClipboard());
    act(() => result.current.cut(["/a/file.txt"], "/a"));
    act(() => result.current.copy(["/b/other.txt"], "/b"));
    expect(result.current.clipboard?.operation).toBe("copy");
    expect(result.current.clipboard?.paths).toEqual(["/b/other.txt"]);
  });
});
