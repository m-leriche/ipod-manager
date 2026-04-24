import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { invoke } from "@tauri-apps/api/core";
import { useQualityActions } from "./useQualityActions";
import type { AudioFileInfo } from "../../../types/quality";

const mockInvoke = vi.mocked(invoke);

const files: AudioFileInfo[] = [
  {
    file_path: "/a.flac",
    file_name: "a.flac",
    codec: "flac",
    sample_rate: 44100,
    bit_depth: 16,
    bitrate: null,
    channels: 2,
    duration: 200,
    is_lossless_container: true,
    verdict: "lossless",
    verdict_reason: "ok",
  },
  {
    file_path: "/b.mp3",
    file_name: "b.mp3",
    codec: "mp3",
    sample_rate: 44100,
    bit_depth: null,
    bitrate: 320000,
    channels: 2,
    duration: 180,
    is_lossless_container: false,
    verdict: "lossy",
    verdict_reason: "mp3",
  },
  {
    file_path: "/c.flac",
    file_name: "c.flac",
    codec: "flac",
    sample_rate: 44100,
    bit_depth: 16,
    bitrate: null,
    channels: 2,
    duration: 300,
    is_lossless_container: true,
    verdict: "suspect",
    verdict_reason: "upsampled",
  },
];

const makeHookArgs = () => ({
  lastScanPaths: { current: ["/music"] },
  setPhase: vi.fn(),
  setError: vi.fn(),
  startProgress: vi.fn(),
  finishProgress: vi.fn(),
  failProgress: vi.fn(),
  cancel: vi.fn(),
  setView: vi.fn(),
});

beforeEach(() => {
  mockInvoke.mockReset();
});

describe("useQualityActions", () => {
  it("starts with empty state", () => {
    const args = makeHookArgs();
    const { result } = renderHook(() =>
      useQualityActions(
        args.lastScanPaths,
        args.setPhase,
        args.setError,
        args.startProgress,
        args.finishProgress,
        args.failProgress,
        args.cancel,
        args.setView,
      ),
    );
    expect(result.current.qualityFiles).toEqual([]);
    expect(result.current.selectedQualityFile).toBeNull();
    expect(result.current.qualityGroups).toEqual([]);
    expect(result.current.qualityCounts).toEqual({ lossless: 0, lossy: 0, suspect: 0 });
  });

  it("startQualityScan invokes scan and updates state", async () => {
    mockInvoke.mockResolvedValue(files);
    const args = makeHookArgs();
    const { result } = renderHook(() =>
      useQualityActions(
        args.lastScanPaths,
        args.setPhase,
        args.setError,
        args.startProgress,
        args.finishProgress,
        args.failProgress,
        args.cancel,
        args.setView,
      ),
    );

    await act(async () => {
      await result.current.startQualityScan();
    });

    expect(mockInvoke).toHaveBeenCalledWith("scan_audio_quality", { path: "/music" });
    expect(result.current.qualityFiles).toEqual(files);
    expect(args.setPhase).toHaveBeenCalledWith("scanned");
    expect(args.setView).toHaveBeenCalledWith("quality");
    expect(args.finishProgress).toHaveBeenCalledWith("Analyzed 3 files");
  });

  it("computes quality counts after scan", async () => {
    mockInvoke.mockResolvedValue(files);
    const args = makeHookArgs();
    const { result } = renderHook(() =>
      useQualityActions(
        args.lastScanPaths,
        args.setPhase,
        args.setError,
        args.startProgress,
        args.finishProgress,
        args.failProgress,
        args.cancel,
        args.setView,
      ),
    );

    await act(async () => {
      await result.current.startQualityScan();
    });

    expect(result.current.qualityCounts).toEqual({ lossless: 1, lossy: 1, suspect: 1 });
  });

  it("handles scan cancellation", async () => {
    mockInvoke.mockRejectedValue("Cancelled");
    const args = makeHookArgs();
    const { result } = renderHook(() =>
      useQualityActions(
        args.lastScanPaths,
        args.setPhase,
        args.setError,
        args.startProgress,
        args.finishProgress,
        args.failProgress,
        args.cancel,
        args.setView,
      ),
    );

    await act(async () => {
      await result.current.startQualityScan();
    });

    expect(args.finishProgress).toHaveBeenCalledWith("Quality scan cancelled");
  });

  it("handles scan error", async () => {
    mockInvoke.mockRejectedValue("ffprobe not found");
    const args = makeHookArgs();
    const { result } = renderHook(() =>
      useQualityActions(
        args.lastScanPaths,
        args.setPhase,
        args.setError,
        args.startProgress,
        args.finishProgress,
        args.failProgress,
        args.cancel,
        args.setView,
      ),
    );

    await act(async () => {
      await result.current.startQualityScan();
    });

    expect(args.setError).toHaveBeenCalledWith("ffprobe not found");
    expect(args.failProgress).toHaveBeenCalledWith("ffprobe not found");
  });

  it("does nothing when lastScanPaths is empty", async () => {
    const args = makeHookArgs();
    args.lastScanPaths.current = [];
    const { result } = renderHook(() =>
      useQualityActions(
        args.lastScanPaths,
        args.setPhase,
        args.setError,
        args.startProgress,
        args.finishProgress,
        args.failProgress,
        args.cancel,
        args.setView,
      ),
    );

    await act(async () => {
      await result.current.startQualityScan();
    });

    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it("selectedQualityData returns matching file", async () => {
    mockInvoke.mockResolvedValue(files);
    const args = makeHookArgs();
    const { result } = renderHook(() =>
      useQualityActions(
        args.lastScanPaths,
        args.setPhase,
        args.setError,
        args.startProgress,
        args.finishProgress,
        args.failProgress,
        args.cancel,
        args.setView,
      ),
    );

    await act(async () => {
      await result.current.startQualityScan();
    });
    act(() => result.current.setSelectedQualityFile("/b.mp3"));
    expect(result.current.selectedQualityData?.file_path).toBe("/b.mp3");
  });

  it("handleSpectrogramLoaded caches base64", async () => {
    mockInvoke.mockResolvedValue(files);
    const args = makeHookArgs();
    const { result } = renderHook(() =>
      useQualityActions(
        args.lastScanPaths,
        args.setPhase,
        args.setError,
        args.startProgress,
        args.finishProgress,
        args.failProgress,
        args.cancel,
        args.setView,
      ),
    );

    act(() => result.current.handleSpectrogramLoaded("/a.flac", "base64data"));
    expect(result.current.spectrograms["/a.flac"]).toBe("base64data");
  });

  it("handleOpenQualityPreview sets modal when file selected", async () => {
    mockInvoke.mockResolvedValue(files);
    const args = makeHookArgs();
    const { result } = renderHook(() =>
      useQualityActions(
        args.lastScanPaths,
        args.setPhase,
        args.setError,
        args.startProgress,
        args.finishProgress,
        args.failProgress,
        args.cancel,
        args.setView,
      ),
    );

    await act(async () => {
      await result.current.startQualityScan();
    });
    act(() => result.current.setSelectedQualityFile("/a.flac"));
    act(() => result.current.handleOpenQualityPreview("spectrogram"));
    expect(result.current.qualityPreviewModal).toEqual({ type: "spectrogram", filePath: "/a.flac" });
  });
});
