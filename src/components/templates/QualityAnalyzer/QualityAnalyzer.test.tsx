import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { QualityAnalyzer } from "./QualityAnalyzer";
import {
  groupByVerdict,
  formatBitrate,
  formatSampleRate,
  formatBitDepth,
  formatDuration,
  verdictColor,
} from "./helpers";
import type { AudioFileInfo } from "../../../types/quality";

const mockInvoke = vi.mocked(invoke);
const mockOpen = vi.mocked(open);

const FILES: AudioFileInfo[] = [
  {
    file_path: "/music/song.flac",
    file_name: "song.flac",
    codec: "flac",
    sample_rate: 44100,
    bit_depth: 16,
    bitrate: null,
    channels: 2,
    duration: 240,
    is_lossless_container: true,
    verdict: "lossless",
    verdict_reason: "FLAC 44.1kHz / 16-bit",
  },
  {
    file_path: "/music/track.mp3",
    file_name: "track.mp3",
    codec: "mp3",
    sample_rate: 44100,
    bit_depth: null,
    bitrate: 320000,
    channels: 2,
    duration: 180,
    is_lossless_container: false,
    verdict: "lossy",
    verdict_reason: "MP3 @ 320kbps",
  },
  {
    file_path: "/music/fake.flac",
    file_name: "fake.flac",
    codec: "flac",
    sample_rate: 44100,
    bit_depth: 16,
    bitrate: null,
    channels: 2,
    duration: 200,
    is_lossless_container: true,
    verdict: "suspect",
    verdict_reason: "Low energy above 16kHz — possible transcode",
  },
];

beforeEach(() => {
  mockInvoke.mockReset();
  mockOpen.mockReset();
  mockInvoke.mockImplementation((cmd) => {
    if (cmd === "check_ffmpeg") return Promise.resolve();
    return Promise.resolve();
  });
});

describe("QualityAnalyzer", () => {
  it("shows dependency check spinner initially", () => {
    mockInvoke.mockImplementation(() => new Promise(() => {}));
    render(<QualityAnalyzer />);
    expect(screen.getByText("Checking dependencies...")).toBeInTheDocument();
  });

  it("shows dependency error when ffmpeg missing", async () => {
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === "check_ffmpeg") return Promise.reject("Missing ffmpeg");
      return Promise.resolve();
    });
    render(<QualityAnalyzer />);
    await waitFor(() => {
      expect(screen.getByText("Missing required tools")).toBeInTheDocument();
    });
  });

  it("renders idle state with folder picker", async () => {
    render(<QualityAnalyzer />);
    await waitFor(() => {
      expect(screen.getByText("Scan a music folder to analyze audio quality")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Scan Quality" })).toBeDisabled();
    });
  });

  it("scans after folder selection", async () => {
    const user = userEvent.setup();
    mockOpen.mockResolvedValue("/music");
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === "check_ffmpeg") return Promise.resolve();
      if (cmd === "scan_audio_quality") return Promise.resolve(FILES);
      return Promise.resolve();
    });

    render(<QualityAnalyzer />);
    await waitFor(() => screen.getByRole("button", { name: "Browse" }));
    await user.click(screen.getByRole("button", { name: "Browse" }));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith("scan_audio_quality", { path: "/music" });
    });
  });

  it("shows grouped results after scan", async () => {
    const user = userEvent.setup();
    mockOpen.mockResolvedValue("/music");
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === "check_ffmpeg") return Promise.resolve();
      if (cmd === "scan_audio_quality") return Promise.resolve(FILES);
      return Promise.resolve();
    });

    render(<QualityAnalyzer />);
    await waitFor(() => screen.getByRole("button", { name: "Browse" }));
    await user.click(screen.getByRole("button", { name: "Browse" }));

    await waitFor(() => {
      expect(screen.getByText("Suspect Transcode")).toBeInTheDocument();
      expect(screen.getByText("Lossy")).toBeInTheDocument();
      expect(screen.getByText("Lossless")).toBeInTheDocument();
      expect(screen.getByText("3 files")).toBeInTheDocument();
    });
  });

  it("shows stats bar with verdict counts", async () => {
    const user = userEvent.setup();
    mockOpen.mockResolvedValue("/music");
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === "check_ffmpeg") return Promise.resolve();
      if (cmd === "scan_audio_quality") return Promise.resolve(FILES);
      return Promise.resolve();
    });

    render(<QualityAnalyzer />);
    await waitFor(() => screen.getByRole("button", { name: "Browse" }));
    await user.click(screen.getByRole("button", { name: "Browse" }));

    await waitFor(() => {
      expect(screen.getByText("1 lossless")).toBeInTheDocument();
      expect(screen.getByText("1 lossy")).toBeInTheDocument();
      expect(screen.getByText("1 suspect")).toBeInTheDocument();
    });
  });

  it("shows detail panel when file selected", async () => {
    const user = userEvent.setup();
    mockOpen.mockResolvedValue("/music");
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === "check_ffmpeg") return Promise.resolve();
      if (cmd === "scan_audio_quality") return Promise.resolve(FILES);
      return Promise.resolve();
    });

    render(<QualityAnalyzer />);
    await waitFor(() => screen.getByRole("button", { name: "Browse" }));
    await user.click(screen.getByRole("button", { name: "Browse" }));

    await waitFor(() => screen.getByText("song.flac"));
    await user.click(screen.getByText("song.flac"));

    await waitFor(() => {
      expect(screen.getByText("16-bit")).toBeInTheDocument();
      expect(screen.getByText("Stereo")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Generate Spectrogram" })).toBeInTheDocument();
    });
  });

  it("calls generate_spectrogram on button click", async () => {
    const user = userEvent.setup();
    mockOpen.mockResolvedValue("/music");
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === "check_ffmpeg") return Promise.resolve();
      if (cmd === "scan_audio_quality") return Promise.resolve(FILES);
      if (cmd === "generate_spectrogram")
        return Promise.resolve({ file_path: "/music/song.flac", image_base64: "iVBORw0KGgo=" });
      return Promise.resolve();
    });

    render(<QualityAnalyzer />);
    await waitFor(() => screen.getByRole("button", { name: "Browse" }));
    await user.click(screen.getByRole("button", { name: "Browse" }));
    await waitFor(() => screen.getByText("song.flac"));
    await user.click(screen.getByText("song.flac"));
    await waitFor(() => screen.getByRole("button", { name: "Generate Spectrogram" }));
    await user.click(screen.getByRole("button", { name: "Generate Spectrogram" }));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith("generate_spectrogram", { filePath: "/music/song.flac" });
      expect(screen.getByAltText("Audio spectrogram")).toBeInTheDocument();
    });
  });
});

// ── Helper tests ─────────────────────────────────────────────────

describe("groupByVerdict", () => {
  it("groups files by verdict with suspect first", () => {
    const groups = groupByVerdict(FILES);
    expect(groups[0].verdict).toBe("suspect");
    expect(groups[1].verdict).toBe("lossy");
    expect(groups[2].verdict).toBe("lossless");
  });

  it("omits empty groups", () => {
    const losslessOnly = FILES.filter((f) => f.verdict === "lossless");
    const groups = groupByVerdict(losslessOnly);
    expect(groups).toHaveLength(1);
    expect(groups[0].verdict).toBe("lossless");
  });

  it("sorts files by name within groups", () => {
    const files: AudioFileInfo[] = [
      { ...FILES[0], file_name: "z.flac", file_path: "/z.flac" },
      { ...FILES[0], file_name: "a.flac", file_path: "/a.flac" },
    ];
    const groups = groupByVerdict(files);
    expect(groups[0].files[0].file_name).toBe("a.flac");
    expect(groups[0].files[1].file_name).toBe("z.flac");
  });
});

describe("formatBitrate", () => {
  it("formats null as --", () => expect(formatBitrate(null)).toBe("--"));
  it("formats kbps", () => expect(formatBitrate(320000)).toBe("320k"));
  it("formats low bitrate", () => expect(formatBitrate(128000)).toBe("128k"));
});

describe("formatSampleRate", () => {
  it("formats 44100", () => expect(formatSampleRate(44100)).toBe("44.1kHz"));
  it("formats 48000", () => expect(formatSampleRate(48000)).toBe("48kHz"));
  it("formats 96000", () => expect(formatSampleRate(96000)).toBe("96kHz"));
});

describe("formatBitDepth", () => {
  it("formats null as --", () => expect(formatBitDepth(null)).toBe("--"));
  it("formats 16-bit", () => expect(formatBitDepth(16)).toBe("16-bit"));
  it("formats 24-bit", () => expect(formatBitDepth(24)).toBe("24-bit"));
});

describe("formatDuration", () => {
  it("formats seconds", () => expect(formatDuration(185)).toBe("3:05"));
  it("formats zero", () => expect(formatDuration(0)).toBe("0:00"));
});

describe("verdictColor", () => {
  it("returns success for lossless", () => expect(verdictColor("lossless")).toBe("text-success"));
  it("returns warning for suspect", () => expect(verdictColor("suspect")).toBe("text-warning"));
  it("returns secondary for lossy", () => expect(verdictColor("lossy")).toBe("text-text-secondary"));
});
