import { renderHook } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { listen } from "@tauri-apps/api/event";
import { useAppEventListeners } from "./useAppEventListeners";

const mockListen = vi.mocked(listen);

describe("useAppEventListeners", () => {
  const callbacks = {
    onOpenSettings: vi.fn(),
    onLibraryChanged: vi.fn(),
    onToggleShortcuts: vi.fn(),
    onCheckForUpdates: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockListen.mockImplementation(() => Promise.resolve(() => {}));
  });

  it("registers listeners for open-settings and library-changed events", () => {
    renderHook(() => useAppEventListeners(callbacks));

    const eventNames = mockListen.mock.calls.map((call) => call[0]);
    expect(eventNames).toContain("open-settings");
    expect(eventNames).toContain("library-changed");
  });

  it("calls onOpenSettings when open-settings event fires", async () => {
    let capturedHandler: ((event: unknown) => void) | undefined;
    mockListen.mockImplementation((event, handler) => {
      if (event === "open-settings") capturedHandler = handler as (event: unknown) => void;
      return Promise.resolve(() => {});
    });

    renderHook(() => useAppEventListeners(callbacks));
    await vi.waitFor(() => expect(capturedHandler).toBeDefined());

    capturedHandler!({});
    expect(callbacks.onOpenSettings).toHaveBeenCalledTimes(1);
  });

  it("calls onLibraryChanged when library-changed event fires", async () => {
    let capturedHandler: ((event: unknown) => void) | undefined;
    mockListen.mockImplementation((event, handler) => {
      if (event === "library-changed") capturedHandler = handler as (event: unknown) => void;
      return Promise.resolve(() => {});
    });

    renderHook(() => useAppEventListeners(callbacks));
    await vi.waitFor(() => expect(capturedHandler).toBeDefined());

    capturedHandler!({});
    expect(callbacks.onLibraryChanged).toHaveBeenCalledTimes(1);
  });

  it("calls onToggleShortcuts on Cmd+/ keydown", () => {
    renderHook(() => useAppEventListeners(callbacks));

    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Slash", metaKey: true }));
    expect(callbacks.onToggleShortcuts).toHaveBeenCalledTimes(1);
  });

  it("calls onToggleShortcuts on Ctrl+/ keydown", () => {
    renderHook(() => useAppEventListeners(callbacks));

    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Slash", ctrlKey: true }));
    expect(callbacks.onToggleShortcuts).toHaveBeenCalledTimes(1);
  });

  it("does not call onToggleShortcuts on / without modifier", () => {
    renderHook(() => useAppEventListeners(callbacks));

    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Slash" }));
    expect(callbacks.onToggleShortcuts).not.toHaveBeenCalled();
  });

  it("respects a custom shortcut override for the shortcuts dialog", () => {
    localStorage.setItem(
      "crate-shortcut-overrides",
      JSON.stringify({ toggleShortcutsDialog: { code: "KeyH", mod: true, shift: false, alt: false } }),
    );
    renderHook(() => useAppEventListeners(callbacks));

    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Slash", metaKey: true }));
    expect(callbacks.onToggleShortcuts).not.toHaveBeenCalled();

    window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyH", metaKey: true }));
    expect(callbacks.onToggleShortcuts).toHaveBeenCalledTimes(1);
    localStorage.removeItem("crate-shortcut-overrides");
  });

  it("cleans up event listeners on unmount", async () => {
    const unlistenFns = [vi.fn(), vi.fn()];
    let callIndex = 0;
    mockListen.mockImplementation(() => Promise.resolve(unlistenFns[callIndex++] ?? vi.fn()));

    const { unmount } = renderHook(() => useAppEventListeners(callbacks));
    // Allow async listen promises to resolve
    await vi.waitFor(() => expect(callIndex).toBeGreaterThan(0));

    unmount();
    // At least one unlisten function should be called
    expect(unlistenFns.some((fn) => fn.mock.calls.length > 0)).toBe(true);
  });
});
