import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { invoke } from "@tauri-apps/api/core";
import { confirm, message } from "@tauri-apps/plugin-dialog";
import { useFileOperations } from "./useFileOperations";
import type { FileEntry, ClipboardState } from "./types";

const mockInvoke = vi.mocked(invoke);
const mockConfirm = vi.mocked(confirm);
const mockMessage = vi.mocked(message);

const entries: FileEntry[] = [
  { name: "file1.txt", is_dir: false, size: 100, modified: 0 },
  { name: "file2.txt", is_dir: false, size: 200, modified: 0 },
];

const reload = vi.fn();

beforeEach(() => {
  mockInvoke.mockReset();
  mockConfirm.mockReset();
  mockMessage.mockReset();
  mockConfirm.mockResolvedValue(true);
  reload.mockClear();
});

describe("useFileOperations", () => {
  describe("handleRename", () => {
    it("invokes rename_entry and reloads", async () => {
      mockInvoke.mockResolvedValue(undefined);
      const { result } = renderHook(() => useFileOperations("/test", entries, reload));

      let success = false;
      await act(async () => {
        success = await result.current.handleRename("file1.txt", "renamed.txt");
      });
      expect(success).toBe(true);
      expect(mockInvoke).toHaveBeenCalledWith("rename_entry", {
        oldPath: "/test/file1.txt",
        newPath: "/test/renamed.txt",
      });
      expect(reload).toHaveBeenCalled();
    });

    it("returns false for empty name", async () => {
      const { result } = renderHook(() => useFileOperations("/test", entries, reload));
      let success = true;
      await act(async () => {
        success = await result.current.handleRename("file1.txt", "  ");
      });
      expect(success).toBe(false);
      expect(mockInvoke).not.toHaveBeenCalled();
    });

    it("returns false when new name equals old name", async () => {
      const { result } = renderHook(() => useFileOperations("/test", entries, reload));
      let success = true;
      await act(async () => {
        success = await result.current.handleRename("file1.txt", "file1.txt");
      });
      expect(success).toBe(false);
    });

    it("shows error message on failure", async () => {
      mockInvoke.mockRejectedValue("permission denied");
      const { result } = renderHook(() => useFileOperations("/test", entries, reload));
      let success = true;
      await act(async () => {
        success = await result.current.handleRename("file1.txt", "new.txt");
      });
      expect(success).toBe(false);
      expect(mockMessage).toHaveBeenCalledWith("Rename failed: permission denied", expect.any(Object));
    });
  });

  describe("handleCreateFolder", () => {
    it("invokes create_folder and reloads", async () => {
      mockInvoke.mockResolvedValue(undefined);
      const { result } = renderHook(() => useFileOperations("/test", entries, reload));
      let success = false;
      await act(async () => {
        success = await result.current.handleCreateFolder("NewFolder");
      });
      expect(success).toBe(true);
      expect(mockInvoke).toHaveBeenCalledWith("create_folder", { path: "/test/NewFolder" });
      expect(reload).toHaveBeenCalled();
    });

    it("returns false for empty name", async () => {
      const { result } = renderHook(() => useFileOperations("/test", entries, reload));
      let success = true;
      await act(async () => {
        success = await result.current.handleCreateFolder("");
      });
      expect(success).toBe(false);
    });

    it("shows error on failure", async () => {
      mockInvoke.mockRejectedValue("already exists");
      const { result } = renderHook(() => useFileOperations("/test", entries, reload));
      await act(async () => {
        await result.current.handleCreateFolder("Existing");
      });
      expect(mockMessage).toHaveBeenCalledWith("Create folder failed: already exists", expect.any(Object));
    });
  });

  describe("handleDelete", () => {
    it("confirms and deletes single item", async () => {
      mockInvoke.mockResolvedValue(undefined);
      const { result } = renderHook(() => useFileOperations("/test", entries, reload));
      await act(async () => {
        await result.current.handleDelete(["file1.txt"]);
      });
      expect(mockConfirm).toHaveBeenCalledWith('Are you sure you want to delete "file1.txt"?', expect.any(Object));
      expect(mockInvoke).toHaveBeenCalledWith("delete_entry", { path: "/test/file1.txt" });
      expect(reload).toHaveBeenCalled();
    });

    it("confirms and deletes multiple items", async () => {
      mockInvoke.mockResolvedValue(undefined);
      const { result } = renderHook(() => useFileOperations("/test", entries, reload));
      await act(async () => {
        await result.current.handleDelete(["file1.txt", "file2.txt"]);
      });
      expect(mockConfirm).toHaveBeenCalledWith("Are you sure you want to delete 2 items?", expect.any(Object));
      expect(mockInvoke).toHaveBeenCalledWith("delete_files", {
        paths: ["/test/file1.txt", "/test/file2.txt"],
      });
    });

    it("does nothing when user declines confirmation", async () => {
      mockConfirm.mockResolvedValue(false);
      const { result } = renderHook(() => useFileOperations("/test", entries, reload));
      await act(async () => {
        await result.current.handleDelete(["file1.txt"]);
      });
      expect(mockInvoke).not.toHaveBeenCalled();
    });

    it("does nothing for empty array", async () => {
      const { result } = renderHook(() => useFileOperations("/test", entries, reload));
      await act(async () => {
        await result.current.handleDelete([]);
      });
      expect(mockConfirm).not.toHaveBeenCalled();
    });
  });

  describe("handlePaste", () => {
    it("confirms and copies files", async () => {
      mockInvoke.mockResolvedValue(undefined);
      const clipboard: ClipboardState = {
        paths: ["/source/file.txt"],
        operation: "copy",
        sourceDir: "/source",
      };
      const { result } = renderHook(() => useFileOperations("/target", entries, reload));
      await act(async () => {
        await result.current.handlePaste(clipboard);
      });
      expect(mockConfirm).toHaveBeenCalledWith('Copy "file.txt" here?', expect.any(Object));
      expect(mockInvoke).toHaveBeenCalledWith("copy_files", {
        operations: [{ source_path: "/source/file.txt", dest_path: "/target/file.txt" }],
      });
      expect(reload).toHaveBeenCalled();
    });

    it("confirms and moves files for cut operation", async () => {
      mockInvoke.mockResolvedValue(undefined);
      const clipboard: ClipboardState = {
        paths: ["/source/file.txt"],
        operation: "cut",
        sourceDir: "/source",
      };
      const { result } = renderHook(() => useFileOperations("/target", entries, reload));
      await act(async () => {
        await result.current.handlePaste(clipboard);
      });
      expect(mockConfirm).toHaveBeenCalledWith('Move "file.txt" here?', expect.any(Object));
      expect(mockInvoke).toHaveBeenCalledWith("move_files", {
        operations: [{ source_path: "/source/file.txt", dest_path: "/target/file.txt" }],
      });
    });

    it("deduplicates names when pasting in same directory", async () => {
      mockInvoke.mockResolvedValue(undefined);
      const clipboard: ClipboardState = {
        paths: ["/test/file1.txt"],
        operation: "copy",
        sourceDir: "/test",
      };
      const { result } = renderHook(() => useFileOperations("/test", entries, reload));
      await act(async () => {
        await result.current.handlePaste(clipboard);
      });
      // file1.txt already exists in entries, so dest should be deduplicated
      const call = mockInvoke.mock.calls.find((c) => c[0] === "copy_files");
      expect(call).toBeDefined();
      const ops = (call![1] as { operations: { dest_path: string }[] }).operations;
      expect(ops[0].dest_path).not.toBe("/test/file1.txt");
    });

    it("does nothing when user declines confirmation", async () => {
      mockConfirm.mockResolvedValue(false);
      const clipboard: ClipboardState = {
        paths: ["/source/file.txt"],
        operation: "copy",
        sourceDir: "/source",
      };
      const { result } = renderHook(() => useFileOperations("/target", entries, reload));
      await act(async () => {
        await result.current.handlePaste(clipboard);
      });
      expect(mockInvoke).not.toHaveBeenCalled();
    });
  });
});
