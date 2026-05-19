import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";

vi.unmock("./ProgressContext");

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({
    setProgressBar: vi.fn().mockResolvedValue(undefined),
    setBadgeLabel: vi.fn().mockResolvedValue(undefined),
  }),
  ProgressBarStatus: { None: 0, Normal: 1, Indeterminate: 2 },
}));

import { ProgressProvider, useProgress } from "./ProgressContext";

const wrapper = ({ children }: { children: React.ReactNode }) => <ProgressProvider>{children}</ProgressProvider>;

describe("ProgressContext", () => {
  it("throws when useProgress is used outside provider", () => {
    expect(() => renderHook(() => useProgress())).toThrow("useProgress must be used within ProgressProvider");
  });

  it("has correct initial state", () => {
    const { result } = renderHook(() => useProgress(), { wrapper });

    expect(result.current.state.active).toBe(false);
    expect(result.current.state.title).toBe("");
    expect(result.current.state.completed).toBe(0);
    expect(result.current.state.total).toBe(0);
    expect(result.current.state.currentItem).toBe("");
    expect(result.current.state.canCancel).toBe(false);
    expect(result.current.state.result).toBeNull();
  });

  it("start(title) sets active=true and title, resets progress", () => {
    const { result } = renderHook(() => useProgress(), { wrapper });

    act(() => {
      result.current.start("Copying files");
    });

    expect(result.current.state.active).toBe(true);
    expect(result.current.state.title).toBe("Copying files");
    expect(result.current.state.completed).toBe(0);
    expect(result.current.state.total).toBe(0);
    expect(result.current.state.canCancel).toBe(false);
  });

  it("start(title, cancelFn) makes canCancel=true", () => {
    const { result } = renderHook(() => useProgress(), { wrapper });
    const cancelFn = vi.fn();

    act(() => {
      result.current.start("Syncing", cancelFn);
    });

    expect(result.current.state.canCancel).toBe(true);
  });

  it("update(completed, total) updates progress values", () => {
    const { result } = renderHook(() => useProgress(), { wrapper });

    act(() => {
      result.current.start("Processing");
    });

    act(() => {
      result.current.update(5, 10);
    });

    expect(result.current.state.completed).toBe(5);
    expect(result.current.state.total).toBe(10);
  });

  it("update(completed, total, item) also updates currentItem", () => {
    const { result } = renderHook(() => useProgress(), { wrapper });

    act(() => {
      result.current.start("Copying");
    });

    act(() => {
      result.current.update(3, 20, "song.flac");
    });

    expect(result.current.state.completed).toBe(3);
    expect(result.current.state.total).toBe(20);
    expect(result.current.state.currentItem).toBe("song.flac");
  });

  it("finish(message) sets success result", () => {
    const { result } = renderHook(() => useProgress(), { wrapper });

    act(() => {
      result.current.start("Working");
    });

    act(() => {
      result.current.finish("All done!");
    });

    expect(result.current.state.result).toEqual({ message: "All done!", success: true });
    expect(result.current.state.canCancel).toBe(false);
  });

  it("fail(message) sets failure result", () => {
    const { result } = renderHook(() => useProgress(), { wrapper });

    act(() => {
      result.current.start("Working");
    });

    act(() => {
      result.current.fail("Something went wrong");
    });

    expect(result.current.state.result).toEqual({
      message: "Something went wrong",
      success: false,
    });
    expect(result.current.state.canCancel).toBe(false);
  });

  it("dismiss() resets to initial state", () => {
    const { result } = renderHook(() => useProgress(), { wrapper });

    act(() => {
      result.current.start("Working");
      result.current.update(5, 10, "file.txt");
      result.current.finish("Done");
    });

    act(() => {
      result.current.dismiss();
    });

    expect(result.current.state.active).toBe(false);
    expect(result.current.state.title).toBe("");
    expect(result.current.state.completed).toBe(0);
    expect(result.current.state.total).toBe(0);
    expect(result.current.state.currentItem).toBe("");
    expect(result.current.state.canCancel).toBe(false);
    expect(result.current.state.result).toBeNull();
  });

  it("cancel() calls the stored cancel function", () => {
    const cancelFn = vi.fn();
    const { result } = renderHook(() => useProgress(), { wrapper });

    act(() => {
      result.current.start("Syncing", cancelFn);
    });

    act(() => {
      result.current.cancel();
    });

    expect(cancelFn).toHaveBeenCalledOnce();
  });

  it("cancel() is safe when no cancel function was provided", () => {
    const { result } = renderHook(() => useProgress(), { wrapper });

    act(() => {
      result.current.start("Working");
    });

    // Should not throw
    act(() => {
      result.current.cancel();
    });

    expect(result.current.state.active).toBe(true);
  });
});
