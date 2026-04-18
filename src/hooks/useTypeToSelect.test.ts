import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useTypeToSelect } from "./useTypeToSelect";

const makeKeyEvent = (key: string, overrides: Partial<React.KeyboardEvent> = {}): React.KeyboardEvent =>
  ({
    key,
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    target: { tagName: "DIV" },
    ...overrides,
  }) as unknown as React.KeyboardEvent;

describe("useTypeToSelect", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const labels = ["Alpha", "Beta", "Bravo", "Charlie", "Delta"];

  it("finds first match for a single character", () => {
    const onMatch = vi.fn();
    const { result } = renderHook(() => useTypeToSelect({ labels, onMatch }));

    act(() => result.current.onKeyDown(makeKeyEvent("b")));
    expect(onMatch).toHaveBeenCalledWith(1); // Beta
  });

  it("finds prefix match for multiple characters", () => {
    const onMatch = vi.fn();
    const { result } = renderHook(() => useTypeToSelect({ labels, onMatch }));

    act(() => {
      result.current.onKeyDown(makeKeyEvent("b"));
      result.current.onKeyDown(makeKeyEvent("r"));
    });
    expect(onMatch).toHaveBeenLastCalledWith(2); // Bravo
  });

  it("is case-insensitive", () => {
    const onMatch = vi.fn();
    const { result } = renderHook(() => useTypeToSelect({ labels, onMatch }));

    act(() => result.current.onKeyDown(makeKeyEvent("C")));
    expect(onMatch).toHaveBeenCalledWith(3); // Charlie
  });

  it("cycles through matches when same letter repeated", () => {
    const onMatch = vi.fn();
    const { result } = renderHook(() => useTypeToSelect({ labels, onMatch }));

    act(() => result.current.onKeyDown(makeKeyEvent("b")));
    expect(onMatch).toHaveBeenLastCalledWith(1); // Beta

    act(() => result.current.onKeyDown(makeKeyEvent("b")));
    expect(onMatch).toHaveBeenLastCalledWith(2); // Bravo

    act(() => result.current.onKeyDown(makeKeyEvent("b")));
    expect(onMatch).toHaveBeenLastCalledWith(1); // wraps back to Beta
  });

  it("resets buffer after timeout", () => {
    const onMatch = vi.fn();
    const { result } = renderHook(() => useTypeToSelect({ labels, onMatch }));

    act(() => result.current.onKeyDown(makeKeyEvent("b")));
    expect(onMatch).toHaveBeenLastCalledWith(1); // Beta

    act(() => vi.advanceTimersByTime(600));

    act(() => result.current.onKeyDown(makeKeyEvent("c")));
    expect(onMatch).toHaveBeenLastCalledWith(3); // Charlie (fresh buffer)
  });

  it("ignores modifier key combos", () => {
    const onMatch = vi.fn();
    const { result } = renderHook(() => useTypeToSelect({ labels, onMatch }));

    act(() => result.current.onKeyDown(makeKeyEvent("a", { metaKey: true })));
    act(() => result.current.onKeyDown(makeKeyEvent("a", { ctrlKey: true })));
    act(() => result.current.onKeyDown(makeKeyEvent("a", { altKey: true })));
    expect(onMatch).not.toHaveBeenCalled();
  });

  it("ignores space key", () => {
    const onMatch = vi.fn();
    const { result } = renderHook(() => useTypeToSelect({ labels, onMatch }));

    act(() => result.current.onKeyDown(makeKeyEvent(" ")));
    expect(onMatch).not.toHaveBeenCalled();
  });

  it("ignores non-printable keys", () => {
    const onMatch = vi.fn();
    const { result } = renderHook(() => useTypeToSelect({ labels, onMatch }));

    act(() => result.current.onKeyDown(makeKeyEvent("Escape")));
    act(() => result.current.onKeyDown(makeKeyEvent("ArrowDown")));
    act(() => result.current.onKeyDown(makeKeyEvent("Tab")));
    expect(onMatch).not.toHaveBeenCalled();
  });

  it("ignores when target is an input", () => {
    const onMatch = vi.fn();
    const { result } = renderHook(() => useTypeToSelect({ labels, onMatch }));

    act(() => result.current.onKeyDown(makeKeyEvent("a", { target: { tagName: "INPUT" } } as never)));
    expect(onMatch).not.toHaveBeenCalled();
  });

  it("does not call onMatch when no match found", () => {
    const onMatch = vi.fn();
    const { result } = renderHook(() => useTypeToSelect({ labels, onMatch }));

    act(() => result.current.onKeyDown(makeKeyEvent("z")));
    expect(onMatch).not.toHaveBeenCalled();
  });

  it("handles empty labels", () => {
    const onMatch = vi.fn();
    const { result } = renderHook(() => useTypeToSelect({ labels: [], onMatch }));

    act(() => result.current.onKeyDown(makeKeyEvent("a")));
    expect(onMatch).not.toHaveBeenCalled();
  });

  it("respects custom resetDelay", () => {
    const onMatch = vi.fn();
    const { result } = renderHook(() => useTypeToSelect({ labels, onMatch, resetDelay: 200 }));

    act(() => result.current.onKeyDown(makeKeyEvent("b")));
    act(() => vi.advanceTimersByTime(250));
    act(() => result.current.onKeyDown(makeKeyEvent("c")));
    expect(onMatch).toHaveBeenLastCalledWith(3); // Charlie (buffer reset after 200ms)
  });
});
