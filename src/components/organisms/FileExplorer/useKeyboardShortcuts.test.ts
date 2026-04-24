import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useKeyboardShortcuts } from "./useKeyboardShortcuts";

const makeHandlers = () => ({
  onCopy: vi.fn(),
  onCut: vi.fn(),
  onPaste: vi.fn(),
  onDelete: vi.fn(),
  onSelectAll: vi.fn(),
  onRename: vi.fn(),
  onNewFolder: vi.fn(),
  onEnter: vi.fn(),
});

const fireKey = (key: string, opts: Partial<KeyboardEventInit> = {}) => {
  document.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, ...opts }));
};

describe("useKeyboardShortcuts", () => {
  let container: HTMLDivElement;
  let containerRef: { current: HTMLDivElement };

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    container.tabIndex = 0;
    container.focus();
    containerRef = { current: container };
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  it("Cmd+C triggers onCopy", () => {
    const handlers = makeHandlers();
    renderHook(() => useKeyboardShortcuts(containerRef, handlers));
    fireKey("c", { metaKey: true });
    expect(handlers.onCopy).toHaveBeenCalledOnce();
  });

  it("Ctrl+C triggers onCopy", () => {
    const handlers = makeHandlers();
    renderHook(() => useKeyboardShortcuts(containerRef, handlers));
    fireKey("c", { ctrlKey: true });
    expect(handlers.onCopy).toHaveBeenCalledOnce();
  });

  it("Cmd+X triggers onCut", () => {
    const handlers = makeHandlers();
    renderHook(() => useKeyboardShortcuts(containerRef, handlers));
    fireKey("x", { metaKey: true });
    expect(handlers.onCut).toHaveBeenCalledOnce();
  });

  it("Cmd+V triggers onPaste", () => {
    const handlers = makeHandlers();
    renderHook(() => useKeyboardShortcuts(containerRef, handlers));
    fireKey("v", { metaKey: true });
    expect(handlers.onPaste).toHaveBeenCalledOnce();
  });

  it("Cmd+A triggers onSelectAll", () => {
    const handlers = makeHandlers();
    renderHook(() => useKeyboardShortcuts(containerRef, handlers));
    fireKey("a", { metaKey: true });
    expect(handlers.onSelectAll).toHaveBeenCalledOnce();
  });

  it("Cmd+Shift+N triggers onNewFolder", () => {
    const handlers = makeHandlers();
    renderHook(() => useKeyboardShortcuts(containerRef, handlers));
    fireKey("N", { metaKey: true, shiftKey: true });
    expect(handlers.onNewFolder).toHaveBeenCalledOnce();
  });

  it("F2 triggers onRename", () => {
    const handlers = makeHandlers();
    renderHook(() => useKeyboardShortcuts(containerRef, handlers));
    fireKey("F2");
    expect(handlers.onRename).toHaveBeenCalledOnce();
  });

  it("Delete triggers onDelete", () => {
    const handlers = makeHandlers();
    renderHook(() => useKeyboardShortcuts(containerRef, handlers));
    fireKey("Delete");
    expect(handlers.onDelete).toHaveBeenCalledOnce();
  });

  it("Backspace triggers onDelete", () => {
    const handlers = makeHandlers();
    renderHook(() => useKeyboardShortcuts(containerRef, handlers));
    fireKey("Backspace");
    expect(handlers.onDelete).toHaveBeenCalledOnce();
  });

  it("Enter triggers onEnter", () => {
    const handlers = makeHandlers();
    renderHook(() => useKeyboardShortcuts(containerRef, handlers));
    fireKey("Enter");
    expect(handlers.onEnter).toHaveBeenCalledOnce();
  });

  it("ignores keypresses when focus is outside container", () => {
    const handlers = makeHandlers();
    const outside = document.createElement("div");
    document.body.appendChild(outside);
    outside.tabIndex = 0;
    outside.focus();

    renderHook(() => useKeyboardShortcuts(containerRef, handlers));
    fireKey("c", { metaKey: true });
    expect(handlers.onCopy).not.toHaveBeenCalled();
    document.body.removeChild(outside);
  });

  it("ignores keypresses when target is an INPUT", () => {
    const handlers = makeHandlers();
    const input = document.createElement("input");
    container.appendChild(input);
    input.focus();

    renderHook(() => useKeyboardShortcuts(containerRef, handlers));

    // Dispatch from the input element
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "c", metaKey: true, bubbles: true }));
    expect(handlers.onCopy).not.toHaveBeenCalled();
  });

  it("cleans up event listener on unmount", () => {
    const handlers = makeHandlers();
    const { unmount } = renderHook(() => useKeyboardShortcuts(containerRef, handlers));
    unmount();
    fireKey("c", { metaKey: true });
    expect(handlers.onCopy).not.toHaveBeenCalled();
  });
});
