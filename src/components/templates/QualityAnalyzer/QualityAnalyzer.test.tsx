import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { QualityAnalyzer } from "./QualityAnalyzer";
import type { AudioFileInfo } from "../../../types/quality";

const mockInvoke = vi.mocked(invoke);
const mockOpen = vi.mocked(open);

const FILES: AudioFileInfo[] = [
  {
    file_path: "/music/a.flac",
    file_name: "a.flac",
    codec: "flac",
    sample_rate: 44100,
    bit_depth: 16,
    bitrate: 900000,
    channels: 2,
    duration: 200,
    is_lossless_container: true,
    verdict: "lossless",
    verdict_reason: "Full frequency spectrum present",
  },
  {
    file_path: "/music/b.mp3",
    file_name: "b.mp3",
    codec: "mp3",
    sample_rate: 44100,
    bit_depth: null,
    bitrate: 320000,
    channels: 2,
    duration: 180,
    is_lossless_container: false,
    verdict: "lossy",
    verdict_reason: "Lossy codec",
  },
  {
    file_path: "/music/c.flac",
    file_name: "c.flac",
    codec: "flac",
    sample_rate: 44100,
    bit_depth: 16,
    bitrate: 700000,
    channels: 2,
    duration: 210,
    is_lossless_container: true,
    verdict: "suspect",
    verdict_reason: "Frequency cutoff at 16kHz suggests a lossy source",
  },
];

beforeEach(() => {
  mockInvoke.mockReset();
  mockOpen.mockReset();
});

describe("QualityAnalyzer", () => {
  it("renders idle state with folder picker and hint", () => {
    render(<QualityAnalyzer />);
    expect(screen.getByText("Choose a folder to analyze")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Browse" })).toBeInTheDocument();
  });

  it("scans the picked folder and shows verdict groups with counts", async () => {
    const user = userEvent.setup();
    mockOpen.mockResolvedValue("/music");
    mockInvoke.mockResolvedValue(FILES);

    render(<QualityAnalyzer />);
    await user.click(screen.getByRole("button", { name: "Browse" }));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith("scan_audio_quality", { path: "/music" });
      expect(screen.getByText("Suspect Transcode")).toBeInTheDocument();
      expect(screen.getByText("Lossless")).toBeInTheDocument();
      expect(screen.getByText("Lossy")).toBeInTheDocument();
    });
    expect(screen.getByText("1 lossless")).toBeInTheDocument();
    expect(screen.getByText("1 lossy")).toBeInTheDocument();
    expect(screen.getByText("1 suspect")).toBeInTheDocument();
  });

  it("shows the detail panel when a file is selected", async () => {
    const user = userEvent.setup();
    mockOpen.mockResolvedValue("/music");
    mockInvoke.mockResolvedValue(FILES);

    render(<QualityAnalyzer />);
    await user.click(screen.getByRole("button", { name: "Browse" }));
    await user.click(await screen.findByText("c.flac"));

    expect(screen.getByText("Frequency cutoff at 16kHz suggests a lossy source")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Generate Spectrogram" })).toBeInTheDocument();
  });

  it("returns to idle with an error on scan failure", async () => {
    const user = userEvent.setup();
    mockOpen.mockResolvedValue("/music");
    mockInvoke.mockRejectedValue("Path does not exist");

    render(<QualityAnalyzer />);
    await user.click(screen.getByRole("button", { name: "Browse" }));

    await waitFor(() => {
      expect(screen.getByText("Path does not exist")).toBeInTheDocument();
      expect(screen.getByText("Choose a folder to analyze")).toBeInTheDocument();
    });
  });

  it("returns to idle without an error on cancelled scan", async () => {
    const user = userEvent.setup();
    mockOpen.mockResolvedValue("/music");
    mockInvoke.mockRejectedValue("Cancelled");

    render(<QualityAnalyzer />);
    await user.click(screen.getByRole("button", { name: "Browse" }));

    await waitFor(() => {
      expect(screen.getByText("Choose a folder to analyze")).toBeInTheDocument();
    });
    expect(screen.queryByText("Cancelled")).not.toBeInTheDocument();
  });
});
