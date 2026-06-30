import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { AudioConverter } from "./AudioConverter";
import { formatFileInfo, FLAC_PRESETS } from "./helpers";

vi.mock("../../../utils/pickPath", () => ({
  pickFiles: vi.fn(),
  pickFolder: vi.fn(),
}));

vi.mock("../../../utils/cancelSync", () => ({
  cancelSync: vi.fn(),
}));

const { pickFiles } = await import("../../../utils/pickPath");
const { pickFolder } = await import("../../../utils/pickPath");

const mockInvoke = vi.mocked(invoke);
const mockPickFiles = vi.mocked(pickFiles);
const mockPickFolder = vi.mocked(pickFolder);

const PROBE_RESULTS = [
  {
    file_path: "/music/song1.flac",
    file_name: "song1.flac",
    codec: "flac",
    sample_rate: 44100,
    bit_depth: 16,
    bitrate_kbps: 1411,
    duration: 245,
    channels: 2,
    is_lossless: true,
  },
  {
    file_path: "/music/song2.mp3",
    file_name: "song2.mp3",
    codec: "mp3",
    sample_rate: 44100,
    bit_depth: null,
    bitrate_kbps: 320,
    duration: 192,
    channels: 2,
    is_lossless: false,
  },
];

const CONVERT_RESULT = {
  success: true,
  cancelled: false,
  converted: 2,
  failed: 0,
  errors: [],
  output_paths: ["/output/song1.mp3", "/output/song2.mp3"],
  warnings: [],
};

beforeEach(() => {
  mockInvoke.mockReset();
  mockPickFiles.mockReset();
  mockPickFolder.mockReset();
  mockInvoke.mockImplementation((cmd) => {
    if (cmd === "check_ffmpeg") return Promise.resolve();
    return Promise.resolve();
  });
});

describe("AudioConverter", () => {
  it("shows spinner while checking ffmpeg", () => {
    mockInvoke.mockImplementation(() => new Promise(() => {}));
    render(<AudioConverter />);
    expect(screen.queryByText("Select Files")).not.toBeInTheDocument();
  });

  it("shows error when ffmpeg is missing", async () => {
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === "check_ffmpeg") return Promise.reject("ffmpeg not found");
      return Promise.resolve();
    });

    render(<AudioConverter />);
    await waitFor(() => {
      expect(screen.getByText(/ffmpeg is required/)).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });

  it("renders main UI when ffmpeg is available", async () => {
    render(<AudioConverter />);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Select Files" })).toBeInTheDocument();
    });
    expect(screen.getByText("Select audio files to convert")).toBeInTheDocument();
  });

  it("shows empty state before file selection", async () => {
    render(<AudioConverter />);
    await waitFor(() => {
      expect(screen.getByText("Select audio files to convert")).toBeInTheDocument();
      expect(screen.getByText("FLAC, MP3, WAV, M4A, OGG, AIFF")).toBeInTheDocument();
    });
  });

  it("probes files after selection and shows file list", async () => {
    const user = userEvent.setup();
    mockPickFiles.mockResolvedValue(["/music/song1.flac", "/music/song2.mp3"]);
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === "check_ffmpeg") return Promise.resolve();
      if (cmd === "probe_audio_files") return Promise.resolve(PROBE_RESULTS);
      return Promise.resolve();
    });

    render(<AudioConverter />);
    await waitFor(() => screen.getByRole("button", { name: "Select Files" }));
    await user.click(screen.getByRole("button", { name: "Select Files" }));

    await waitFor(() => {
      expect(screen.getByText("song1.flac")).toBeInTheDocument();
      expect(screen.getByText("song2.mp3")).toBeInTheDocument();
      expect(screen.getByText("2 files")).toBeInTheDocument();
    });
  });

  it("filters out errored codecs from probe results", async () => {
    const user = userEvent.setup();
    const withError = [...PROBE_RESULTS, { ...PROBE_RESULTS[0], file_name: "bad.wav", codec: "error" }];
    mockPickFiles.mockResolvedValue(["/music/song1.flac"]);
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === "check_ffmpeg") return Promise.resolve();
      if (cmd === "probe_audio_files") return Promise.resolve(withError);
      return Promise.resolve();
    });

    render(<AudioConverter />);
    await waitFor(() => screen.getByRole("button", { name: "Select Files" }));
    await user.click(screen.getByRole("button", { name: "Select Files" }));

    await waitFor(() => {
      expect(screen.getByText("2 files")).toBeInTheDocument();
      expect(screen.queryByText("bad.wav")).not.toBeInTheDocument();
    });
  });

  it("shows format toggle defaulting to MP3", async () => {
    render(<AudioConverter />);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "MP3" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "FLAC" })).toBeInTheDocument();
    });
    // MP3 bitrate options visible by default
    expect(screen.getByRole("button", { name: "128 kbps" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "320 kbps" })).toBeInTheDocument();
  });

  it("shows FLAC preset dropdown when FLAC is selected", async () => {
    const user = userEvent.setup();
    render(<AudioConverter />);
    await waitFor(() => screen.getByRole("button", { name: "FLAC" }));
    await user.click(screen.getByRole("button", { name: "FLAC" }));

    await waitFor(() => {
      // MP3 bitrate options should be gone
      expect(screen.queryByRole("button", { name: "128 kbps" })).not.toBeInTheDocument();
      // FLAC presets dropdown should be visible
      expect(screen.getByRole("combobox")).toBeInTheDocument();
    });
  });

  it("shows lossy-to-FLAC warning when lossy files are loaded with FLAC target", async () => {
    const user = userEvent.setup();
    mockPickFiles.mockResolvedValue(["/music/song2.mp3"]);
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === "check_ffmpeg") return Promise.resolve();
      if (cmd === "probe_audio_files") return Promise.resolve([PROBE_RESULTS[1]]);
      return Promise.resolve();
    });

    render(<AudioConverter />);
    await waitFor(() => screen.getByRole("button", { name: "Select Files" }));
    await user.click(screen.getByRole("button", { name: "Select Files" }));
    await waitFor(() => screen.getByText("song2.mp3"));

    await user.click(screen.getByRole("button", { name: "FLAC" }));
    await waitFor(() => {
      expect(screen.getByText(/lossy.*lossless container/i)).toBeInTheDocument();
    });
  });

  it("disables convert button without output folder", async () => {
    const user = userEvent.setup();
    mockPickFiles.mockResolvedValue(["/music/song1.flac"]);
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === "check_ffmpeg") return Promise.resolve();
      if (cmd === "probe_audio_files") return Promise.resolve([PROBE_RESULTS[0]]);
      return Promise.resolve();
    });

    render(<AudioConverter />);
    await waitFor(() => screen.getByRole("button", { name: "Select Files" }));
    await user.click(screen.getByRole("button", { name: "Select Files" }));
    await waitFor(() => screen.getByText("song1.flac"));

    expect(screen.getByRole("button", { name: "Convert" })).toBeDisabled();
  });

  it("calls convert_audio with correct params", async () => {
    const user = userEvent.setup();
    mockPickFiles.mockResolvedValue(["/music/song1.flac"]);
    mockPickFolder.mockResolvedValue("/output");
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === "check_ffmpeg") return Promise.resolve();
      if (cmd === "probe_audio_files") return Promise.resolve([PROBE_RESULTS[0]]);
      if (cmd === "convert_audio") return Promise.resolve(CONVERT_RESULT);
      return Promise.resolve();
    });

    render(<AudioConverter />);
    await waitFor(() => screen.getByRole("button", { name: "Select Files" }));
    await user.click(screen.getByRole("button", { name: "Select Files" }));
    await waitFor(() => screen.getByText("song1.flac"));

    await user.click(screen.getByRole("button", { name: "Browse" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Convert" })).toBeEnabled());
    await user.click(screen.getByRole("button", { name: "Convert" }));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith("convert_audio", {
        requests: [
          {
            input_path: "/music/song1.flac",
            output_dir: "/output",
            target_format: "mp3",
            mp3_bitrate: 320,
            flac_sample_rate: null,
            flac_bit_depth: null,
          },
        ],
      });
    });
  });

  it("shows success result after conversion", async () => {
    const user = userEvent.setup();
    mockPickFiles.mockResolvedValue(["/music/song1.flac"]);
    mockPickFolder.mockResolvedValue("/output");
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === "check_ffmpeg") return Promise.resolve();
      if (cmd === "probe_audio_files") return Promise.resolve([PROBE_RESULTS[0]]);
      if (cmd === "convert_audio") return Promise.resolve(CONVERT_RESULT);
      return Promise.resolve();
    });

    render(<AudioConverter />);
    await waitFor(() => screen.getByRole("button", { name: "Select Files" }));
    await user.click(screen.getByRole("button", { name: "Select Files" }));
    await waitFor(() => screen.getByText("song1.flac"));

    await user.click(screen.getByRole("button", { name: "Browse" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Convert" })).toBeEnabled());
    await user.click(screen.getByRole("button", { name: "Convert" }));

    await waitFor(() => {
      expect(screen.getByText(/Converted 2 files/)).toBeInTheDocument();
    });
  });

  it("shows cancelled result", async () => {
    const user = userEvent.setup();
    mockPickFiles.mockResolvedValue(["/music/song1.flac"]);
    mockPickFolder.mockResolvedValue("/output");
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === "check_ffmpeg") return Promise.resolve();
      if (cmd === "probe_audio_files") return Promise.resolve([PROBE_RESULTS[0]]);
      if (cmd === "convert_audio") return Promise.resolve({ ...CONVERT_RESULT, cancelled: true, converted: 1 });
      return Promise.resolve();
    });

    render(<AudioConverter />);
    await waitFor(() => screen.getByRole("button", { name: "Select Files" }));
    await user.click(screen.getByRole("button", { name: "Select Files" }));
    await waitFor(() => screen.getByText("song1.flac"));

    await user.click(screen.getByRole("button", { name: "Browse" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Convert" })).toBeEnabled());
    await user.click(screen.getByRole("button", { name: "Convert" }));

    await waitFor(() => {
      expect(screen.getByText(/Cancelled/)).toBeInTheDocument();
    });
  });

  it("shows lossless/lossy badges in file list", async () => {
    const user = userEvent.setup();
    mockPickFiles.mockResolvedValue(["/music/song1.flac", "/music/song2.mp3"]);
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === "check_ffmpeg") return Promise.resolve();
      if (cmd === "probe_audio_files") return Promise.resolve(PROBE_RESULTS);
      return Promise.resolve();
    });

    render(<AudioConverter />);
    await waitFor(() => screen.getByRole("button", { name: "Select Files" }));
    await user.click(screen.getByRole("button", { name: "Select Files" }));

    await waitFor(() => {
      expect(screen.getByText("Lossless")).toBeInTheDocument();
      expect(screen.getByText("Lossy")).toBeInTheDocument();
    });
  });
});

describe("formatFileInfo", () => {
  it("formats lossless file info", () => {
    const result = formatFileInfo("flac", 44100, 16, null);
    expect(result).toBe("FLAC · 16-bit · 44.1 kHz");
  });

  it("formats lossy file info", () => {
    const result = formatFileInfo("mp3", 44100, null, 320);
    expect(result).toBe("MP3 · 44.1 kHz · 320 kbps");
  });

  it("includes all available fields", () => {
    const result = formatFileInfo("flac", 96000, 24, 2822);
    expect(result).toBe("FLAC · 24-bit · 96.0 kHz · 2822 kbps");
  });
});

describe("FLAC_PRESETS", () => {
  it("contains expected presets", () => {
    expect(FLAC_PRESETS).toHaveProperty("original");
    expect(FLAC_PRESETS).toHaveProperty("16/44.1");
    expect(FLAC_PRESETS["16/44.1"]).toEqual({ label: "16-bit / 44.1 kHz (CD)", sample_rate: 44100, bit_depth: 16 });
  });

  it("original preset has null values", () => {
    expect(FLAC_PRESETS.original.sample_rate).toBeNull();
    expect(FLAC_PRESETS.original.bit_depth).toBeNull();
  });
});
