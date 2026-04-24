import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useDragAndDrop } from "./useDragAndDrop";
import type { FileEntry } from "./types";

beforeEach(() => {
  vi.clearAllMocks();
});

const folder: FileEntry = { name: "subdir", is_dir: true, size: 0, modified: 0 };

const makeDragEvent = (overrides: Partial<React.DragEvent> = {}): React.DragEvent =>
  ({
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
    dataTransfer: {
      setData: vi.fn(),
      getData: vi.fn(() => "{}"),
      effectAllowed: "copyMove",
      dropEffect: "copy",
      setDragImage: vi.fn(),
    },
    altKey: false,
    ...overrides,
  }) as unknown as React.DragEvent;

describe("useDragAndDrop", () => {
  it("returns initial state", () => {
    const onDrop = vi.fn();
    const { result } = renderHook(() =>
      useDragAndDrop({ paneId: "left", currentPath: "/test", selected: new Set(), onDrop }),
    );
    expect(result.current.isDragOver).toBe(false);
    expect(result.current.dropTargetFolder).toBeNull();
  });

  it("is disabled without paneId", () => {
    const onDrop = vi.fn();
    const { result } = renderHook(() => useDragAndDrop({ currentPath: "/test", selected: new Set(), onDrop }));
    // containerHandlers should exist but not trigger drag state
    const e = makeDragEvent();
    act(() => result.current.containerHandlers.onDragEnter(e));
    expect(result.current.isDragOver).toBe(false);
  });

  it("rowDragStart sets drag data for single file", () => {
    const onDrop = vi.fn();
    const entry: FileEntry = { name: "file.txt", is_dir: false, size: 100, modified: 0 };
    const { result } = renderHook(() =>
      useDragAndDrop({ paneId: "left", currentPath: "/test", selected: new Set(), onDrop }),
    );

    const e = makeDragEvent();
    act(() => result.current.rowDragStart(e, entry));
    expect(e.dataTransfer.setData).toHaveBeenCalledWith("application/json", expect.stringContaining("/test/file.txt"));
  });

  it("rowDragStart includes all selected files when entry is selected", () => {
    const onDrop = vi.fn();
    const entry: FileEntry = { name: "file1.txt", is_dir: false, size: 100, modified: 0 };
    const selected = new Set(["file1.txt", "file2.txt"]);
    const { result } = renderHook(() => useDragAndDrop({ paneId: "left", currentPath: "/test", selected, onDrop }));

    const e = makeDragEvent();
    act(() => result.current.rowDragStart(e, entry));
    const data = JSON.parse((e.dataTransfer.setData as ReturnType<typeof vi.fn>).mock.calls[0][1]);
    expect(data.paths).toContain("/test/file1.txt");
    expect(data.paths).toContain("/test/file2.txt");
  });

  it("rowDragStart only drags the clicked entry if not in selection", () => {
    const onDrop = vi.fn();
    const entry: FileEntry = { name: "file3.txt", is_dir: false, size: 100, modified: 0 };
    const selected = new Set(["file1.txt", "file2.txt"]);
    const { result } = renderHook(() => useDragAndDrop({ paneId: "left", currentPath: "/test", selected, onDrop }));

    const e = makeDragEvent();
    act(() => result.current.rowDragStart(e, entry));
    const data = JSON.parse((e.dataTransfer.setData as ReturnType<typeof vi.fn>).mock.calls[0][1]);
    expect(data.paths).toEqual(["/test/file3.txt"]);
  });

  it("folderHandlers returns handlers for a folder entry", () => {
    const onDrop = vi.fn();
    const { result } = renderHook(() =>
      useDragAndDrop({ paneId: "left", currentPath: "/test", selected: new Set(), onDrop }),
    );

    const handlers = result.current.folderHandlers(folder);
    expect(handlers).toHaveProperty("onDragEnter");
    expect(handlers).toHaveProperty("onDragOver");
    expect(handlers).toHaveProperty("onDragLeave");
    expect(handlers).toHaveProperty("onDrop");
  });
});
