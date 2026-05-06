import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useDragAndDrop } from "./useDragAndDrop";

beforeEach(() => {
  vi.clearAllMocks();
  // jsdom doesn't implement elementFromPoint — stub it
  if (!document.elementFromPoint) {
    document.elementFromPoint = vi.fn(() => null);
  }
});

afterEach(() => {
  document.body.style.userSelect = "";
  document.body.style.cursor = "";
});

const makeMouseEvent = (overrides: Partial<React.MouseEvent> = {}): React.MouseEvent =>
  ({
    button: 0,
    clientX: 100,
    clientY: 100,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
    ...overrides,
  }) as unknown as React.MouseEvent;

describe("useDragAndDrop", () => {
  it("returns initial state", () => {
    const onDrop = vi.fn();
    const { result } = renderHook(() =>
      useDragAndDrop({ paneId: "left", currentPath: "/test", selected: new Set(), onDrop }),
    );
    expect(result.current.isDragOver).toBe(false);
    expect(result.current.dropTargetFolder).toBeNull();
    expect(result.current.wasDragging.current).toBe(false);
  });

  it("is disabled without paneId", () => {
    const onDrop = vi.fn();
    const { result } = renderHook(() => useDragAndDrop({ currentPath: "/test", selected: new Set(), onDrop }));
    const e = makeMouseEvent();
    act(() => result.current.rowMouseDown(e, "/test/file.txt"));
    expect(result.current.wasDragging.current).toBe(false);
  });

  it("ignores non-left-click", () => {
    const onDrop = vi.fn();
    const { result } = renderHook(() =>
      useDragAndDrop({ paneId: "left", currentPath: "/test", selected: new Set(), onDrop }),
    );
    const e = makeMouseEvent({ button: 2 });
    act(() => result.current.rowMouseDown(e, "/test/file.txt"));
    expect(result.current.wasDragging.current).toBe(false);
  });

  it("rowMouseDown starts tracking for single unselected file", () => {
    const onDrop = vi.fn();
    const { result } = renderHook(() =>
      useDragAndDrop({ paneId: "left", currentPath: "/test", selected: new Set(), onDrop }),
    );
    const e = makeMouseEvent();
    // Should not throw — sets up mousemove/mouseup listeners
    act(() => result.current.rowMouseDown(e, "/test/file.txt"));
    // Clean up by dispatching mouseup
    act(() => document.dispatchEvent(new MouseEvent("mouseup", { clientX: 100, clientY: 100 })));
  });

  it("rowMouseDown uses all selected files when entry is in selection", () => {
    const onDrop = vi.fn();
    const selected = new Set(["/test/file1.txt", "/test/file2.txt"]);
    const { result } = renderHook(() =>
      useDragAndDrop({ paneId: "left", currentPath: "/test", selected, onDrop }),
    );
    const e = makeMouseEvent();
    act(() => result.current.rowMouseDown(e, "/test/file1.txt"));
    // Drag beyond threshold
    act(() => document.dispatchEvent(new MouseEvent("mousemove", { clientX: 110, clientY: 100 })));
    expect(result.current.wasDragging.current).toBe(true);
    // Clean up
    act(() => document.dispatchEvent(new MouseEvent("mouseup", { clientX: 110, clientY: 100 })));
  });

  it("does not start dragging before movement threshold", () => {
    const onDrop = vi.fn();
    const { result } = renderHook(() =>
      useDragAndDrop({ paneId: "left", currentPath: "/test", selected: new Set(), onDrop }),
    );
    const e = makeMouseEvent({ clientX: 100, clientY: 100 });
    act(() => result.current.rowMouseDown(e, "/test/file.txt"));
    // Move less than threshold (< 5px manhattan distance)
    act(() => document.dispatchEvent(new MouseEvent("mousemove", { clientX: 102, clientY: 101 })));
    expect(result.current.wasDragging.current).toBe(false);
    // Clean up
    act(() => document.dispatchEvent(new MouseEvent("mouseup", { clientX: 102, clientY: 101 })));
  });

  it("cancels drag on Escape key", () => {
    const onDrop = vi.fn();
    const { result } = renderHook(() =>
      useDragAndDrop({ paneId: "left", currentPath: "/test", selected: new Set(), onDrop }),
    );
    const e = makeMouseEvent({ clientX: 100, clientY: 100 });
    act(() => result.current.rowMouseDown(e, "/test/file.txt"));
    // Move past threshold
    act(() => document.dispatchEvent(new MouseEvent("mousemove", { clientX: 110, clientY: 100 })));
    expect(result.current.wasDragging.current).toBe(true);
    // Press Escape
    act(() => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })));
    // Overlay should be cleaned up, body styles restored
    expect(document.body.style.cursor).toBe("");
    expect(document.body.style.userSelect).toBe("");
  });
});
