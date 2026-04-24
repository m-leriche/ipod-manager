import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import { useLibraryImport } from "./useLibraryImport";

const mockInvoke = vi.mocked(invoke);
const mockListen = vi.mocked(listen);
const mockOpen = vi.mocked(open);

const makeArgs = () => ({
  isActive: true,
  startProgress: vi.fn(),
  updateProgress: vi.fn(),
  finishProgress: vi.fn(),
  failProgress: vi.fn(),
  fetchBrowserData: vi.fn().mockResolvedValue(undefined),
  setHasLibrary: vi.fn(),
  setDataLoaded: vi.fn(),
});

beforeEach(() => {
  mockInvoke.mockReset();
  mockListen.mockReset();
  mockOpen.mockReset();
  mockListen.mockImplementation(() => Promise.resolve(() => {}));
});

describe("useLibraryImport", () => {
  it("returns initial state", () => {
    const args = makeArgs();
    const { result } = renderHook(() =>
      useLibraryImport(
        args.isActive,
        args.startProgress,
        args.updateProgress,
        args.finishProgress,
        args.failProgress,
        args.fetchBrowserData,
        args.setHasLibrary,
        args.setDataLoaded,
      ),
    );
    expect(result.current.isDragOver).toBe(false);
  });

  describe("handleChooseLibrary", () => {
    it("does nothing when dialog is cancelled", async () => {
      mockOpen.mockResolvedValue(null);
      const args = makeArgs();
      const { result } = renderHook(() =>
        useLibraryImport(
          args.isActive,
          args.startProgress,
          args.updateProgress,
          args.finishProgress,
          args.failProgress,
          args.fetchBrowserData,
          args.setHasLibrary,
          args.setDataLoaded,
        ),
      );

      await act(async () => {
        await result.current.handleChooseLibrary();
      });

      expect(mockOpen).toHaveBeenCalledWith({ directory: true, multiple: false, title: "Choose library location" });
      expect(mockInvoke).not.toHaveBeenCalled();
    });

    it("scans library when folder is selected", async () => {
      mockOpen.mockResolvedValue("/my-music");
      mockInvoke.mockResolvedValue(undefined);
      const args = makeArgs();
      const { result } = renderHook(() =>
        useLibraryImport(
          args.isActive,
          args.startProgress,
          args.updateProgress,
          args.finishProgress,
          args.failProgress,
          args.fetchBrowserData,
          args.setHasLibrary,
          args.setDataLoaded,
        ),
      );

      await act(async () => {
        await result.current.handleChooseLibrary();
      });

      expect(mockInvoke).toHaveBeenCalledWith("set_library_location", { path: "/my-music" });
      expect(args.startProgress).toHaveBeenCalledWith("Scanning library...", expect.any(Function));
      expect(args.finishProgress).toHaveBeenCalledWith("Library scan complete");
      expect(args.setHasLibrary).toHaveBeenCalledWith(true);
      expect(args.fetchBrowserData).toHaveBeenCalled();
      expect(args.setDataLoaded).toHaveBeenCalledWith(true);
    });

    it("calls failProgress on scan error", async () => {
      mockOpen.mockResolvedValue("/my-music");
      mockInvoke.mockRejectedValue("Permission denied");
      const args = makeArgs();
      const { result } = renderHook(() =>
        useLibraryImport(
          args.isActive,
          args.startProgress,
          args.updateProgress,
          args.finishProgress,
          args.failProgress,
          args.fetchBrowserData,
          args.setHasLibrary,
          args.setDataLoaded,
        ),
      );

      await act(async () => {
        await result.current.handleChooseLibrary();
      });

      expect(args.failProgress).toHaveBeenCalledWith("Scan failed: Permission denied");
    });
  });

  describe("handleDrop", () => {
    it("imports files when library location exists", async () => {
      mockInvoke.mockImplementation(async (cmd: string) => {
        if (cmd === "get_library_location") return "/my-music";
        if (cmd === "import_to_library") return { copied: 3, skipped: 1, errors: [] };
        return undefined;
      });
      const args = makeArgs();
      const { result } = renderHook(() =>
        useLibraryImport(
          args.isActive,
          args.startProgress,
          args.updateProgress,
          args.finishProgress,
          args.failProgress,
          args.fetchBrowserData,
          args.setHasLibrary,
          args.setDataLoaded,
        ),
      );

      await act(async () => {
        await result.current.handleDrop(["/downloads/song1.flac", "/downloads/song2.flac"]);
      });

      expect(mockInvoke).toHaveBeenCalledWith("import_to_library", {
        paths: ["/downloads/song1.flac", "/downloads/song2.flac"],
      });
      expect(args.finishProgress).toHaveBeenCalledWith("Imported 3 tracks, 1 skipped");
    });

    it("prompts for library location when none set", async () => {
      mockOpen.mockResolvedValue("/new-library");
      mockInvoke.mockImplementation(async (cmd: string) => {
        if (cmd === "get_library_location") return null;
        if (cmd === "set_library_location") return undefined;
        if (cmd === "import_to_library") return { copied: 1, skipped: 0, errors: [] };
        return undefined;
      });
      const args = makeArgs();
      const { result } = renderHook(() =>
        useLibraryImport(
          args.isActive,
          args.startProgress,
          args.updateProgress,
          args.finishProgress,
          args.failProgress,
          args.fetchBrowserData,
          args.setHasLibrary,
          args.setDataLoaded,
        ),
      );

      await act(async () => {
        await result.current.handleDrop(["/song.flac"]);
      });

      expect(mockOpen).toHaveBeenCalled();
      expect(mockInvoke).toHaveBeenCalledWith("set_library_location", { path: "/new-library" });
      expect(args.finishProgress).toHaveBeenCalledWith("Imported 1 track");
    });

    it("aborts if user cancels library location dialog", async () => {
      mockOpen.mockResolvedValue(null);
      mockInvoke.mockImplementation(async (cmd: string) => {
        if (cmd === "get_library_location") return null;
        return undefined;
      });
      const args = makeArgs();
      const { result } = renderHook(() =>
        useLibraryImport(
          args.isActive,
          args.startProgress,
          args.updateProgress,
          args.finishProgress,
          args.failProgress,
          args.fetchBrowserData,
          args.setHasLibrary,
          args.setDataLoaded,
        ),
      );

      await act(async () => {
        await result.current.handleDrop(["/song.flac"]);
      });

      expect(args.startProgress).not.toHaveBeenCalled();
    });

    it("shows message for all-skipped imports", async () => {
      mockInvoke.mockImplementation(async (cmd: string) => {
        if (cmd === "get_library_location") return "/music";
        if (cmd === "import_to_library") return { copied: 0, skipped: 5, errors: [] };
        return undefined;
      });
      const args = makeArgs();
      const { result } = renderHook(() =>
        useLibraryImport(
          args.isActive,
          args.startProgress,
          args.updateProgress,
          args.finishProgress,
          args.failProgress,
          args.fetchBrowserData,
          args.setHasLibrary,
          args.setDataLoaded,
        ),
      );

      await act(async () => {
        await result.current.handleDrop(["/song.flac"]);
      });

      expect(args.finishProgress).toHaveBeenCalledWith("5 tracks already in library");
    });

    it("shows message for no audio files", async () => {
      mockInvoke.mockImplementation(async (cmd: string) => {
        if (cmd === "get_library_location") return "/music";
        if (cmd === "import_to_library") return { copied: 0, skipped: 0, errors: [] };
        return undefined;
      });
      const args = makeArgs();
      const { result } = renderHook(() =>
        useLibraryImport(
          args.isActive,
          args.startProgress,
          args.updateProgress,
          args.finishProgress,
          args.failProgress,
          args.fetchBrowserData,
          args.setHasLibrary,
          args.setDataLoaded,
        ),
      );

      await act(async () => {
        await result.current.handleDrop(["/document.pdf"]);
      });

      expect(args.finishProgress).toHaveBeenCalledWith("No audio files found");
    });

    it("handles import failure", async () => {
      mockInvoke.mockImplementation(async (cmd: string) => {
        if (cmd === "get_library_location") return "/music";
        if (cmd === "import_to_library") throw "Disk full";
        return undefined;
      });
      const args = makeArgs();
      const { result } = renderHook(() =>
        useLibraryImport(
          args.isActive,
          args.startProgress,
          args.updateProgress,
          args.finishProgress,
          args.failProgress,
          args.fetchBrowserData,
          args.setHasLibrary,
          args.setDataLoaded,
        ),
      );

      await act(async () => {
        await result.current.handleDrop(["/song.flac"]);
      });

      expect(args.failProgress).toHaveBeenCalledWith("Import failed: Disk full");
    });
  });
});
