import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useDragDrop } from "./useDragDrop";

// The module-level mock in setup.ts returns a basic onDragDropEvent stub.
// We override it per-test when we need to capture the handler.
const mockOnDragDropEvent = vi.fn(() => Promise.resolve(() => {}));

vi.mock("@tauri-apps/api/webview", () => ({
  getCurrentWebview: () => ({
    onDragDropEvent: mockOnDragDropEvent,
  }),
}));

beforeEach(() => {
  mockOnDragDropEvent.mockClear();
  mockOnDragDropEvent.mockImplementation(() => Promise.resolve(() => {}));
});

describe("useDragDrop", () => {
  it("subscribes to drag-drop events on mount", () => {
    renderHook(() => useDragDrop("idle", vi.fn()));
    expect(mockOnDragDropEvent).toHaveBeenCalledTimes(1);
  });

  it("returns false for isDragOver initially", () => {
    const { result } = renderHook(() => useDragDrop("idle", vi.fn()));
    expect(result.current).toBe(false);
  });

  it("sets isDragOver on enter event", async () => {
    let handler: (event: { payload: { type: string; paths: string[] } }) => void = () => {};
    mockOnDragDropEvent.mockImplementation(((cb: typeof handler) => {
      handler = cb;
      return Promise.resolve(() => {});
    }) as Parameters<typeof mockOnDragDropEvent.mockImplementation>[0]);

    const { result } = renderHook(() => useDragDrop("idle", vi.fn()));
    await vi.waitFor(() => expect(mockOnDragDropEvent).toHaveBeenCalled());

    act(() => handler({ payload: { type: "enter", paths: [] } }));
    expect(result.current).toBe(true);
  });

  it("clears isDragOver on leave event", async () => {
    let handler: (event: { payload: { type: string; paths: string[] } }) => void = () => {};
    mockOnDragDropEvent.mockImplementation(((cb: typeof handler) => {
      handler = cb;
      return Promise.resolve(() => {});
    }) as Parameters<typeof mockOnDragDropEvent.mockImplementation>[0]);

    const { result } = renderHook(() => useDragDrop("idle", vi.fn()));
    await vi.waitFor(() => expect(mockOnDragDropEvent).toHaveBeenCalled());

    act(() => handler({ payload: { type: "enter", paths: [] } }));
    act(() => handler({ payload: { type: "leave", paths: [] } }));
    expect(result.current).toBe(false);
  });

  it("calls onDrop with paths when phase is idle", async () => {
    let handler: (event: { payload: { type: string; paths: string[] } }) => void = () => {};
    mockOnDragDropEvent.mockImplementation(((cb: typeof handler) => {
      handler = cb;
      return Promise.resolve(() => {});
    }) as Parameters<typeof mockOnDragDropEvent.mockImplementation>[0]);

    const onDrop = vi.fn();
    renderHook(() => useDragDrop("idle", onDrop));
    await vi.waitFor(() => expect(mockOnDragDropEvent).toHaveBeenCalled());

    act(() => handler({ payload: { type: "drop", paths: ["/music/album"] } }));
    expect(onDrop).toHaveBeenCalledWith(["/music/album"]);
  });

  it("calls onDrop when phase is scanned", async () => {
    let handler: (event: { payload: { type: string; paths: string[] } }) => void = () => {};
    mockOnDragDropEvent.mockImplementation(((cb: typeof handler) => {
      handler = cb;
      return Promise.resolve(() => {});
    }) as Parameters<typeof mockOnDragDropEvent.mockImplementation>[0]);

    const onDrop = vi.fn();
    renderHook(() => useDragDrop("scanned", onDrop));
    await vi.waitFor(() => expect(mockOnDragDropEvent).toHaveBeenCalled());

    act(() => handler({ payload: { type: "drop", paths: ["/music"] } }));
    expect(onDrop).toHaveBeenCalledWith(["/music"]);
  });

  it("does not call onDrop when phase is scanning", async () => {
    let handler: (event: { payload: { type: string; paths: string[] } }) => void = () => {};
    mockOnDragDropEvent.mockImplementation(((cb: typeof handler) => {
      handler = cb;
      return Promise.resolve(() => {});
    }) as Parameters<typeof mockOnDragDropEvent.mockImplementation>[0]);

    const onDrop = vi.fn();
    renderHook(() => useDragDrop("scanning", onDrop));
    await vi.waitFor(() => expect(mockOnDragDropEvent).toHaveBeenCalled());

    act(() => handler({ payload: { type: "drop", paths: ["/music"] } }));
    expect(onDrop).not.toHaveBeenCalled();
  });

  it("does not call onDrop with empty paths", async () => {
    let handler: (event: { payload: { type: string; paths: string[] } }) => void = () => {};
    mockOnDragDropEvent.mockImplementation(((cb: typeof handler) => {
      handler = cb;
      return Promise.resolve(() => {});
    }) as Parameters<typeof mockOnDragDropEvent.mockImplementation>[0]);

    const onDrop = vi.fn();
    renderHook(() => useDragDrop("idle", onDrop));
    await vi.waitFor(() => expect(mockOnDragDropEvent).toHaveBeenCalled());

    act(() => handler({ payload: { type: "drop", paths: [] } }));
    expect(onDrop).not.toHaveBeenCalled();
  });
});
