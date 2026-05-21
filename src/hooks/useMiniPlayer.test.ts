import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useMiniPlayer } from "./useMiniPlayer";

const mockSetSize = vi.fn().mockResolvedValue(undefined);
const mockSetMinSize = vi.fn().mockResolvedValue(undefined);
const mockSetAlwaysOnTop = vi.fn().mockResolvedValue(undefined);
const mockInnerSize = vi.fn().mockResolvedValue({ width: 1200, height: 800 });

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({
    setSize: mockSetSize,
    setMinSize: mockSetMinSize,
    setAlwaysOnTop: mockSetAlwaysOnTop,
    innerSize: mockInnerSize,
  }),
}));

vi.mock("@tauri-apps/api/dpi", () => ({
  LogicalSize: class LogicalSize {
    width: number;
    height: number;
    constructor(width: number, height: number) {
      this.width = width;
      this.height = height;
    }
  },
  PhysicalSize: class PhysicalSize {
    width: number;
    height: number;
    constructor(width: number, height: number) {
      this.width = width;
      this.height = height;
    }
  },
}));

describe("useMiniPlayer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("starts in full-size mode", () => {
    const { result } = renderHook(() => useMiniPlayer());
    expect(result.current.miniPlayer).toBe(false);
  });

  it("enters mini player mode", async () => {
    const { result } = renderHook(() => useMiniPlayer());

    await act(async () => {
      await result.current.toggleMiniPlayer();
    });

    expect(result.current.miniPlayer).toBe(true);
    expect(mockSetAlwaysOnTop).toHaveBeenCalledWith(true);
    expect(mockSetMinSize).toHaveBeenCalled();
    expect(mockSetSize).toHaveBeenCalled();
  });

  it("saves window size before entering mini mode", async () => {
    mockInnerSize.mockResolvedValue({ width: 1400, height: 900 });
    const { result } = renderHook(() => useMiniPlayer());

    await act(async () => {
      await result.current.toggleMiniPlayer();
    });

    expect(mockInnerSize).toHaveBeenCalled();
  });

  it("restores window size when exiting mini mode", async () => {
    mockInnerSize.mockResolvedValue({ width: 1400, height: 900 });
    const { result } = renderHook(() => useMiniPlayer());

    // Enter mini mode
    await act(async () => {
      await result.current.toggleMiniPlayer();
    });
    expect(result.current.miniPlayer).toBe(true);

    // Exit mini mode
    await act(async () => {
      await result.current.toggleMiniPlayer();
    });

    expect(result.current.miniPlayer).toBe(false);
    expect(mockSetAlwaysOnTop).toHaveBeenCalledWith(false);
    expect(mockSetMinSize).toHaveBeenCalledWith(null);
    // Should restore with PhysicalSize
    const lastSetSizeCall = mockSetSize.mock.calls[mockSetSize.mock.calls.length - 1][0];
    expect(lastSetSizeCall.width).toBe(1400);
    expect(lastSetSizeCall.height).toBe(900);
  });
});
