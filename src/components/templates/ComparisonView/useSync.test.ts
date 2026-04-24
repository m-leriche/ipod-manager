import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { invoke } from "@tauri-apps/api/core";
import { useSync } from "./useSync";
import type { CompareEntry, CopyResult } from "./types";

const mockInvoke = vi.mocked(invoke);

const makeEntry = (path: string, status: CompareEntry["status"]): CompareEntry => ({
  relative_path: path,
  is_dir: false,
  source_size: 100,
  target_size: status === "target_only" ? 200 : null,
  source_modified: null,
  target_modified: null,
  status,
});

const okResult: CopyResult = { total: 1, succeeded: 1, failed: 0, cancelled: false, errors: [] };

beforeEach(() => {
  mockInvoke.mockReset();
});

describe("useSync", () => {
  const entries = [
    makeEntry("new.txt", "source_only"),
    makeEntry("extra.txt", "target_only"),
    makeEntry("changed.txt", "modified"),
    makeEntry("same.txt", "same"),
  ];
  const selected = new Set(["new.txt", "extra.txt", "changed.txt", "same.txt"]);
  const compare = vi.fn().mockResolvedValue(undefined);
  const setError = vi.fn();

  it("starts with idle state", () => {
    const { result } = renderHook(() => useSync("/src", "/tgt", entries, selected, compare, setError));
    expect(result.current.syncing).toBe(false);
    expect(result.current.progress).toBeNull();
    expect(result.current.result).toBeNull();
  });

  it("copyToTarget copies source_only and modified files", async () => {
    mockInvoke.mockResolvedValue(okResult);
    compare.mockClear();
    const { result } = renderHook(() => useSync("/src", "/tgt", entries, selected, compare, setError));

    await act(async () => {
      await result.current.copyToTarget();
    });

    const call = mockInvoke.mock.calls.find((c) => c[0] === "copy_files");
    expect(call).toBeDefined();
    const ops = (call![1] as { operations: { source_path: string; dest_path: string }[] }).operations;
    expect(ops).toHaveLength(2);
    expect(ops[0]).toEqual({ source_path: "/src/new.txt", dest_path: "/tgt/new.txt" });
    expect(ops[1]).toEqual({ source_path: "/src/changed.txt", dest_path: "/tgt/changed.txt" });
    expect(compare).toHaveBeenCalled();
  });

  it("copyToSource copies target_only and modified files", async () => {
    mockInvoke.mockResolvedValue(okResult);
    compare.mockClear();
    const { result } = renderHook(() => useSync("/src", "/tgt", entries, selected, compare, setError));

    await act(async () => {
      await result.current.copyToSource();
    });

    const call = mockInvoke.mock.calls.find((c) => c[0] === "copy_files");
    expect(call).toBeDefined();
    const ops = (call![1] as { operations: { source_path: string; dest_path: string }[] }).operations;
    expect(ops).toHaveLength(2);
    expect(ops[0]).toEqual({ source_path: "/tgt/extra.txt", dest_path: "/src/extra.txt" });
    expect(ops[1]).toEqual({ source_path: "/tgt/changed.txt", dest_path: "/src/changed.txt" });
  });

  it("deleteTarget deletes target_only files", async () => {
    mockInvoke.mockResolvedValue(okResult);
    compare.mockClear();
    const { result } = renderHook(() => useSync("/src", "/tgt", entries, selected, compare, setError));

    await act(async () => {
      await result.current.deleteTarget();
    });

    const call = mockInvoke.mock.calls.find((c) => c[0] === "delete_files");
    expect(call).toBeDefined();
    const paths = (call![1] as { paths: string[] }).paths;
    expect(paths).toEqual(["/tgt/extra.txt"]);
  });

  it("only operates on selected entries", async () => {
    mockInvoke.mockResolvedValue(okResult);
    const partialSelected = new Set(["new.txt"]); // only new.txt selected
    const { result } = renderHook(() => useSync("/src", "/tgt", entries, partialSelected, compare, setError));

    await act(async () => {
      await result.current.copyToTarget();
    });

    const call = mockInvoke.mock.calls.find((c) => c[0] === "copy_files");
    const ops = (call![1] as { operations: { source_path: string }[] }).operations;
    expect(ops).toHaveLength(1);
    expect(ops[0].source_path).toBe("/src/new.txt");
  });

  it("mirrorToTarget copies and deletes", async () => {
    mockInvoke.mockResolvedValue(okResult);
    compare.mockClear();
    const { result } = renderHook(() => useSync("/src", "/tgt", entries, selected, compare, setError));

    await act(async () => {
      await result.current.mirrorToTarget();
    });

    const copyCall = mockInvoke.mock.calls.find((c) => c[0] === "copy_files");
    const deleteCall = mockInvoke.mock.calls.find((c) => c[0] === "delete_files");
    expect(copyCall).toBeDefined();
    expect(deleteCall).toBeDefined();
    expect(compare).toHaveBeenCalled();
  });

  it("mirrorToTarget stops if copy is cancelled", async () => {
    const cancelledResult: CopyResult = { total: 1, succeeded: 0, failed: 0, cancelled: true, errors: [] };
    mockInvoke.mockResolvedValue(cancelledResult);
    const { result } = renderHook(() => useSync("/src", "/tgt", entries, selected, compare, setError));

    await act(async () => {
      await result.current.mirrorToTarget();
    });

    // Should not call delete_files after cancelled copy
    const deleteCall = mockInvoke.mock.calls.find((c) => c[0] === "delete_files");
    expect(deleteCall).toBeUndefined();
  });

  it("sets error on failure", async () => {
    mockInvoke.mockRejectedValue("Disk full");
    setError.mockClear();
    const { result } = renderHook(() => useSync("/src", "/tgt", entries, selected, compare, setError));

    await act(async () => {
      await result.current.copyToTarget();
    });

    expect(setError).toHaveBeenCalledWith("Disk full");
    expect(result.current.syncing).toBe(false);
  });

  it("handleCancel invokes cancel_sync", async () => {
    mockInvoke.mockResolvedValue(undefined);
    const { result } = renderHook(() => useSync("/src", "/tgt", entries, selected, compare, setError));

    await act(async () => {
      await result.current.handleCancel();
    });

    expect(mockInvoke).toHaveBeenCalledWith("cancel_sync");
  });

  it("setResult clears result", () => {
    const { result } = renderHook(() => useSync("/src", "/tgt", entries, selected, compare, setError));
    act(() => result.current.setResult(null));
    expect(result.current.result).toBeNull();
  });
});
