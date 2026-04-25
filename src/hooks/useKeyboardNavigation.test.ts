import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useKeyboardNavigation } from "./useKeyboardNavigation";

const makeKeyEvent = (key: string, overrides: Partial<React.KeyboardEvent> = {}): React.KeyboardEvent =>
  ({
    key,
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    target: { tagName: "DIV" },
    preventDefault: vi.fn(),
    ...overrides,
  }) as unknown as React.KeyboardEvent;

const mockVirtualizer = () =>
  ({ scrollToIndex: vi.fn() }) as unknown as Parameters<typeof useKeyboardNavigation>[0]["virtualizer"];

describe("useKeyboardNavigation", () => {
  const defaults = () => ({
    count: 5,
    onNavigate: vi.fn(),
    onActivate: vi.fn(),
    onDeselect: vi.fn(),
    virtualizer: mockVirtualizer(),
    selectedIndex: 0,
  });

  it("ArrowDown moves to next item", () => {
    const opts = defaults();
    const { result } = renderHook(() => useKeyboardNavigation(opts));

    act(() => result.current.onKeyDown(makeKeyEvent("ArrowDown")));
    expect(opts.onNavigate).toHaveBeenCalledWith(1, "single");
    expect(opts.virtualizer.scrollToIndex).toHaveBeenCalledWith(1, { align: "auto" });
  });

  it("ArrowUp moves to previous item", () => {
    const opts = defaults();
    opts.selectedIndex = 2;
    const { result } = renderHook(() => useKeyboardNavigation(opts));

    act(() => result.current.onKeyDown(makeKeyEvent("ArrowUp")));
    expect(opts.onNavigate).toHaveBeenCalledWith(1, "single");
  });

  it("ArrowDown does not go past last item", () => {
    const opts = defaults();
    opts.selectedIndex = 4;
    const { result } = renderHook(() => useKeyboardNavigation(opts));

    act(() => result.current.onKeyDown(makeKeyEvent("ArrowDown")));
    expect(opts.onNavigate).toHaveBeenCalledWith(4, "single");
  });

  it("ArrowUp does not go before minIndex", () => {
    const opts = defaults();
    opts.selectedIndex = 0;
    const { result } = renderHook(() => useKeyboardNavigation(opts));

    act(() => result.current.onKeyDown(makeKeyEvent("ArrowUp")));
    expect(opts.onNavigate).toHaveBeenCalledWith(0, "single");
  });

  it("ArrowUp with minIndex -1 can reach -1", () => {
    const opts = { ...defaults(), minIndex: -1, selectedIndex: 0 };
    const { result } = renderHook(() => useKeyboardNavigation(opts));

    act(() => result.current.onKeyDown(makeKeyEvent("ArrowUp")));
    expect(opts.onNavigate).toHaveBeenCalledWith(-1, "single");
    // Should not call scrollToIndex for -1
    expect(opts.virtualizer.scrollToIndex).not.toHaveBeenCalled();
  });

  it("Home jumps to minIndex", () => {
    const opts = defaults();
    opts.selectedIndex = 3;
    const { result } = renderHook(() => useKeyboardNavigation(opts));

    act(() => result.current.onKeyDown(makeKeyEvent("Home")));
    expect(opts.onNavigate).toHaveBeenCalledWith(0, "single");
  });

  it("End jumps to last item", () => {
    const opts = defaults();
    const { result } = renderHook(() => useKeyboardNavigation(opts));

    act(() => result.current.onKeyDown(makeKeyEvent("End")));
    expect(opts.onNavigate).toHaveBeenCalledWith(4, "single");
  });

  it("Enter activates current index", () => {
    const opts = defaults();
    opts.selectedIndex = 2;
    const { result } = renderHook(() => useKeyboardNavigation(opts));

    act(() => result.current.onKeyDown(makeKeyEvent("Enter")));
    expect(opts.onActivate).toHaveBeenCalledWith(2);
  });

  it("Escape calls onDeselect and resets focused index", () => {
    const opts = defaults();
    const { result } = renderHook(() => useKeyboardNavigation(opts));

    // Move to index 3
    act(() => result.current.onKeyDown(makeKeyEvent("ArrowDown")));
    act(() => result.current.onKeyDown(makeKeyEvent("Escape")));
    expect(opts.onDeselect).toHaveBeenCalled();

    // Next ArrowDown should start from minIndex (0)
    opts.onNavigate.mockClear();
    act(() => result.current.onKeyDown(makeKeyEvent("ArrowDown")));
    expect(opts.onNavigate).toHaveBeenCalledWith(1, "single");
  });

  it("Shift+ArrowDown passes range mode", () => {
    const opts = defaults();
    const { result } = renderHook(() => useKeyboardNavigation(opts));

    act(() => result.current.onKeyDown(makeKeyEvent("ArrowDown", { shiftKey: true })));
    expect(opts.onNavigate).toHaveBeenCalledWith(1, "range");
  });

  it("Shift+ArrowUp passes range mode", () => {
    const opts = defaults();
    opts.selectedIndex = 3;
    const { result } = renderHook(() => useKeyboardNavigation(opts));

    act(() => result.current.onKeyDown(makeKeyEvent("ArrowUp", { shiftKey: true })));
    expect(opts.onNavigate).toHaveBeenCalledWith(2, "range");
  });

  it("ignores events with metaKey", () => {
    const opts = defaults();
    const { result } = renderHook(() => useKeyboardNavigation(opts));

    act(() => result.current.onKeyDown(makeKeyEvent("ArrowDown", { metaKey: true })));
    expect(opts.onNavigate).not.toHaveBeenCalled();
  });

  it("ignores events with ctrlKey", () => {
    const opts = defaults();
    const { result } = renderHook(() => useKeyboardNavigation(opts));

    act(() => result.current.onKeyDown(makeKeyEvent("ArrowDown", { ctrlKey: true })));
    expect(opts.onNavigate).not.toHaveBeenCalled();
  });

  it("ignores events when target is INPUT", () => {
    const opts = defaults();
    const { result } = renderHook(() => useKeyboardNavigation(opts));

    act(() => result.current.onKeyDown(makeKeyEvent("ArrowDown", { target: { tagName: "INPUT" } } as never)));
    expect(opts.onNavigate).not.toHaveBeenCalled();
  });

  it("ignores events when target is TEXTAREA", () => {
    const opts = defaults();
    const { result } = renderHook(() => useKeyboardNavigation(opts));

    act(() => result.current.onKeyDown(makeKeyEvent("ArrowDown", { target: { tagName: "TEXTAREA" } } as never)));
    expect(opts.onNavigate).not.toHaveBeenCalled();
  });

  it("handles empty list gracefully", () => {
    const opts = { ...defaults(), count: 0 };
    const { result } = renderHook(() => useKeyboardNavigation(opts));

    act(() => result.current.onKeyDown(makeKeyEvent("ArrowDown")));
    expect(opts.onNavigate).not.toHaveBeenCalled();

    // Escape still works on empty list
    act(() => result.current.onKeyDown(makeKeyEvent("Escape")));
    expect(opts.onDeselect).toHaveBeenCalled();
  });

  it("calls preventDefault on handled keys", () => {
    const opts = defaults();
    const { result } = renderHook(() => useKeyboardNavigation(opts));

    const event = makeKeyEvent("ArrowDown");
    act(() => result.current.onKeyDown(event));
    expect(event.preventDefault).toHaveBeenCalled();
  });

  it("does not preventDefault on unhandled keys", () => {
    const opts = defaults();
    const { result } = renderHook(() => useKeyboardNavigation(opts));

    const event = makeKeyEvent("a");
    act(() => result.current.onKeyDown(event));
    expect(event.preventDefault).not.toHaveBeenCalled();
  });

  it("sequential arrow presses track position correctly", () => {
    const opts = defaults();
    const { result } = renderHook(() => useKeyboardNavigation(opts));

    act(() => result.current.onKeyDown(makeKeyEvent("ArrowDown"))); // 0 → 1
    act(() => result.current.onKeyDown(makeKeyEvent("ArrowDown"))); // 1 → 2
    act(() => result.current.onKeyDown(makeKeyEvent("ArrowDown"))); // 2 → 3
    expect(opts.onNavigate).toHaveBeenLastCalledWith(3, "single");

    act(() => result.current.onKeyDown(makeKeyEvent("ArrowUp"))); // 3 → 2
    expect(opts.onNavigate).toHaveBeenLastCalledWith(2, "single");
  });

  it("clamps stale focusedIndex when count shrinks", () => {
    const onNavigate = vi.fn();
    const virtualizer = mockVirtualizer();
    let count = 5;

    const { result, rerender } = renderHook(() =>
      useKeyboardNavigation({
        count,
        onNavigate,
        virtualizer,
        selectedIndex: 0,
      }),
    );

    // Move to index 4 (last)
    for (let i = 0; i < 4; i++) {
      act(() => result.current.onKeyDown(makeKeyEvent("ArrowDown")));
    }
    expect(onNavigate).toHaveBeenLastCalledWith(4, "single");

    // Shrink count and re-render so the hook picks up the new value
    count = 3;
    rerender();

    // focusedIndex is still 4 (stale), pressing ArrowDown should clamp to 2 first
    act(() => result.current.onKeyDown(makeKeyEvent("ArrowDown")));
    // After clamping to 2 (count-1=2), ArrowDown goes to min(3, 2) = 2
    expect(onNavigate).toHaveBeenLastCalledWith(2, "single");
  });
});
