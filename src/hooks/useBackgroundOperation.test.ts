import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useBackgroundOperation } from "./useBackgroundOperation";

const mockInvoke = vi.mocked(invoke);
const mockListen = vi.mocked(listen);

interface TestResult {
  fixed: number;
  failed: number;
  cancelled: boolean;
}

const makeConfig = (overrides = {}) => ({
  progressEvent: "test-progress",
  progressItemKey: "current_item",
  startCommand: "start_operation",
  cancelCommand: "cancel_operation",
  scanningLabel: "Scanning...",
  onError: (e: unknown) => ({ fixed: 0, failed: 0, cancelled: false, error: `${e}` }) as unknown as TestResult,
  ...overrides,
});

describe("useBackgroundOperation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListen.mockImplementation(() => Promise.resolve(() => {}));
    mockInvoke.mockImplementation(() => Promise.resolve());
  });

  it("returns initial idle state", () => {
    const { result } = renderHook(() => useBackgroundOperation<TestResult>(makeConfig()));
    expect(result.current.state).toEqual({
      active: false,
      total: 0,
      completed: 0,
      currentItem: "",
    });
    expect(result.current.result).toBeNull();
  });

  it("sets active state and scanning label on start", async () => {
    // Make invoke hang so we can observe the active state
    mockInvoke.mockImplementation(
      () =>
        new Promise(() => {
          /* never resolves */
        }),
    );

    const { result } = renderHook(() => useBackgroundOperation<TestResult>(makeConfig()));

    await act(async () => {
      result.current.start();
      // Allow listen promise to resolve
      await Promise.resolve();
    });

    expect(result.current.state.active).toBe(true);
    expect(result.current.state.currentItem).toBe("Scanning...");
  });

  it("updates state from progress events", async () => {
    let progressHandler: ((event: { payload: Record<string, unknown> }) => void) | undefined;
    mockListen.mockImplementation((_event, handler) => {
      progressHandler = handler as typeof progressHandler;
      return Promise.resolve(() => {});
    });

    const resultData: TestResult = { fixed: 5, failed: 1, cancelled: false };
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === "start_operation") {
        // Emit progress then resolve
        progressHandler?.({ payload: { total: 10, completed: 3, current_item: "Album X" } });
        return Promise.resolve(resultData);
      }
      return Promise.resolve();
    });

    const { result } = renderHook(() => useBackgroundOperation<TestResult>(makeConfig()));

    await act(async () => {
      result.current.start();
    });

    // After completion, state resets
    expect(result.current.state.active).toBe(false);
    expect(result.current.result).toEqual(resultData);
  });

  it("calls onError handler when command fails", async () => {
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === "start_operation") return Promise.reject("Network error");
      return Promise.resolve();
    });

    const { result } = renderHook(() => useBackgroundOperation<TestResult>(makeConfig()));

    await act(async () => {
      result.current.start();
    });

    expect(result.current.result).toEqual({ fixed: 0, failed: 0, cancelled: false, error: "Network error" });
  });

  it("prevents duplicate starts", async () => {
    let resolveStart: ((value: unknown) => void) | undefined;
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === "start_operation") {
        return new Promise((resolve) => {
          resolveStart = resolve;
        });
      }
      return Promise.resolve();
    });

    const { result } = renderHook(() => useBackgroundOperation<TestResult>(makeConfig()));

    await act(async () => {
      result.current.start();
      await Promise.resolve();
    });

    // Try starting again while active
    await act(async () => {
      result.current.start();
    });

    // Only one invoke call to start_operation
    const startCalls = mockInvoke.mock.calls.filter((c) => c[0] === "start_operation");
    expect(startCalls).toHaveLength(1);

    // Cleanup
    await act(async () => {
      resolveStart?.({ fixed: 0, failed: 0, cancelled: false });
    });
  });

  it("invokes cancel command", async () => {
    const { result } = renderHook(() => useBackgroundOperation<TestResult>(makeConfig()));
    await act(async () => {
      result.current.cancel();
    });
    expect(mockInvoke).toHaveBeenCalledWith("cancel_operation");
  });

  it("dismisses result", async () => {
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === "start_operation") return Promise.resolve({ fixed: 1, failed: 0, cancelled: false });
      return Promise.resolve();
    });

    const { result } = renderHook(() => useBackgroundOperation<TestResult>(makeConfig()));

    await act(async () => {
      result.current.start();
    });
    expect(result.current.result).not.toBeNull();

    act(() => {
      result.current.dismissResult();
    });
    expect(result.current.result).toBeNull();
  });

  it("calls onSuccess callback on successful completion", async () => {
    const onSuccess = vi.fn();
    const resultData: TestResult = { fixed: 3, failed: 0, cancelled: false };
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === "start_operation") return Promise.resolve(resultData);
      return Promise.resolve();
    });

    const { result } = renderHook(() => useBackgroundOperation<TestResult>(makeConfig({ onSuccess })));

    await act(async () => {
      result.current.start();
    });

    expect(onSuccess).toHaveBeenCalledWith(resultData);
  });
});
