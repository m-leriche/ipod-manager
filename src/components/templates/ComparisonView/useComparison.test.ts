import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { invoke } from "@tauri-apps/api/core";
import { useComparison } from "./useComparison";
import type { CompareEntry } from "./types";

const mockInvoke = vi.mocked(invoke);

const entries: CompareEntry[] = [
  {
    relative_path: "a.txt",
    is_dir: false,
    source_size: 100,
    target_size: null,
    source_modified: null,
    target_modified: null,
    status: "source_only",
  },
  {
    relative_path: "b.txt",
    is_dir: false,
    source_size: 100,
    target_size: 100,
    source_modified: null,
    target_modified: null,
    status: "same",
  },
  {
    relative_path: "c.txt",
    is_dir: false,
    source_size: null,
    target_size: 200,
    source_modified: null,
    target_modified: null,
    status: "target_only",
  },
  {
    relative_path: "d.txt",
    is_dir: false,
    source_size: 100,
    target_size: 150,
    source_modified: null,
    target_modified: null,
    status: "modified",
  },
];

beforeEach(() => {
  mockInvoke.mockReset();
});

describe("useComparison", () => {
  it("compares directories on mount", async () => {
    mockInvoke.mockResolvedValue(entries);
    const onCompared = vi.fn();
    const { result } = renderHook(() => useComparison("/src", "/tgt", [], onCompared));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(mockInvoke).toHaveBeenCalledWith("compare_directories", { source: "/src", target: "/tgt" });
    expect(result.current.error).toBeNull();
    expect(onCompared).toHaveBeenCalled();
  });

  it("computes stats correctly", async () => {
    mockInvoke.mockResolvedValue(entries);
    const onCompared = vi.fn();
    const { result } = renderHook(() => useComparison("/src", "/tgt", [], onCompared));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.stats).toEqual({
      source_only: 1,
      target_only: 1,
      modified: 1,
      same: 1,
    });
  });

  it("filters by 'differences' by default", async () => {
    mockInvoke.mockResolvedValue(entries);
    const onCompared = vi.fn();
    const { result } = renderHook(() => useComparison("/src", "/tgt", [], onCompared));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.filter).toBe("differences");
    expect(result.current.filtered.every((e) => e.status !== "same")).toBe(true);
    expect(result.current.filtered.length).toBe(3);
  });

  it("filter 'all' returns everything", async () => {
    mockInvoke.mockResolvedValue(entries);
    const onCompared = vi.fn();
    const { result } = renderHook(() => useComparison("/src", "/tgt", [], onCompared));

    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => result.current.setFilter("all"));
    expect(result.current.filtered.length).toBe(4);
  });

  it("filter by specific status works", async () => {
    mockInvoke.mockResolvedValue(entries);
    const onCompared = vi.fn();
    const { result } = renderHook(() => useComparison("/src", "/tgt", [], onCompared));

    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => result.current.setFilter("source_only"));
    expect(result.current.filtered.length).toBe(1);
    expect(result.current.filtered[0].relative_path).toBe("a.txt");
  });

  it("exclusions filter out matching paths", async () => {
    const entriesWithPaths: CompareEntry[] = [
      {
        relative_path: "dir/a.txt",
        is_dir: false,
        source_size: 100,
        target_size: null,
        source_modified: null,
        target_modified: null,
        status: "source_only",
      },
      {
        relative_path: "dir/b.txt",
        is_dir: false,
        source_size: 100,
        target_size: null,
        source_modified: null,
        target_modified: null,
        status: "source_only",
      },
      {
        relative_path: "other.txt",
        is_dir: false,
        source_size: 100,
        target_size: null,
        source_modified: null,
        target_modified: null,
        status: "source_only",
      },
    ];
    mockInvoke.mockResolvedValue(entriesWithPaths);
    const onCompared = vi.fn();
    const { result } = renderHook(() => useComparison("/src", "/tgt", ["dir"], onCompared));

    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => result.current.setFilter("all"));
    expect(result.current.filtered.length).toBe(1);
    expect(result.current.filtered[0].relative_path).toBe("other.txt");
  });

  it("builds entry map from visible entries", async () => {
    mockInvoke.mockResolvedValue(entries);
    const onCompared = vi.fn();
    const { result } = renderHook(() => useComparison("/src", "/tgt", [], onCompared));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.entryMap.get("a.txt")?.status).toBe("source_only");
    expect(result.current.entryMap.size).toBe(4);
  });

  it("sets error on invoke failure", async () => {
    mockInvoke.mockRejectedValue("Network error");
    const onCompared = vi.fn();
    const { result } = renderHook(() => useComparison("/src", "/tgt", [], onCompared));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe("Network error");
  });

  it("ignores cancelled errors", async () => {
    mockInvoke.mockRejectedValue("Cancelled by user");
    const onCompared = vi.fn();
    const { result } = renderHook(() => useComparison("/src", "/tgt", [], onCompared));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBeNull();
  });

  it("cancel invokes cancel_sync", async () => {
    mockInvoke.mockResolvedValue(entries);
    const onCompared = vi.fn();
    const { result } = renderHook(() => useComparison("/src", "/tgt", [], onCompared));

    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      await result.current.cancel();
    });
    expect(mockInvoke).toHaveBeenCalledWith("cancel_sync");
  });
});
