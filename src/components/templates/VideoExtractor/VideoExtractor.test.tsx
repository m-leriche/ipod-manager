import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { VideoExtractor } from "./VideoExtractor";
import { parseTimestamp, formatDuration, buildChapters } from "./helpers";

const mockInvoke = vi.mocked(invoke);
const mockOpen = vi.mocked(open);

const VIDEO_PROBE = {
  title: "My Concert",
  duration: 600,
  duration_display: "10:00",
};

beforeEach(() => {
  mockInvoke.mockReset();
  mockOpen.mockReset();
  mockInvoke.mockImplementation((cmd) => {
    if (cmd === "check_ffmpeg") return Promise.resolve();
    return Promise.resolve();
  });
});

describe("VideoExtractor", () => {
  it("shows dependency check spinner initially", () => {
    mockInvoke.mockImplementation(() => new Promise(() => {}));
    render(<VideoExtractor />);
    expect(screen.getByText("Checking dependencies...")).toBeInTheDocument();
  });

  it("shows dependency error when ffmpeg is missing", async () => {
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === "check_ffmpeg") return Promise.reject("Missing required tools: ffmpeg");
      return Promise.resolve();
    });

    render(<VideoExtractor />);
    await waitFor(() => {
      expect(screen.getByText("Missing required tools")).toBeInTheDocument();
      expect(screen.getByText("brew install ffmpeg")).toBeInTheDocument();
    });
  });

  it("renders idle state with file picker prompt", async () => {
    render(<VideoExtractor />);
    await waitFor(() => {
      expect(screen.getByText("Select a video file to extract audio")).toBeInTheDocument();
      expect(screen.getByText("No file selected")).toBeInTheDocument();
    });
  });

  it("probes video after file selection", async () => {
    mockOpen.mockResolvedValue("/path/to/video.mp4");
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === "check_ffmpeg") return Promise.resolve();
      if (cmd === "probe_video") return Promise.resolve(VIDEO_PROBE);
      return Promise.resolve();
    });

    render(<VideoExtractor />);
    await waitFor(() => screen.getByText("No file selected"));

    await userEvent.setup().click(screen.getByText("No file selected").closest("div")!);

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith("probe_video", { path: "/path/to/video.mp4" });
      expect(screen.getByText("My Concert")).toBeInTheDocument();
      expect(screen.getByText("Duration: 10:00")).toBeInTheDocument();
    });
  });

  it("shows chapter editor after video is loaded", async () => {
    mockOpen.mockResolvedValueOnce("/path/to/video.mp4");
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === "check_ffmpeg") return Promise.resolve();
      if (cmd === "probe_video") return Promise.resolve(VIDEO_PROBE);
      return Promise.resolve();
    });

    render(<VideoExtractor />);
    await waitFor(() => screen.getByText("No file selected"));
    await userEvent.setup().click(screen.getByText("No file selected").closest("div")!);

    await waitFor(() => {
      expect(screen.getByText("Chapters")).toBeInTheDocument();
      expect(screen.getByText("+ Add Chapter")).toBeInTheDocument();
      expect(screen.getByText("No chapters — audio will be extracted as a single file")).toBeInTheDocument();
    });
  });

  it("can add and remove chapters", async () => {
    const user = userEvent.setup();
    mockOpen.mockResolvedValueOnce("/path/to/video.mp4");
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === "check_ffmpeg") return Promise.resolve();
      if (cmd === "probe_video") return Promise.resolve(VIDEO_PROBE);
      return Promise.resolve();
    });

    render(<VideoExtractor />);
    await waitFor(() => screen.getByText("No file selected"));
    await user.click(screen.getByText("No file selected").closest("div")!);

    await waitFor(() => screen.getByText("+ Add Chapter"));
    await user.click(screen.getByText("+ Add Chapter"));

    await waitFor(() => {
      expect(screen.getByPlaceholderText("Chapter 1")).toBeInTheDocument();
      expect(screen.getByPlaceholderText("0:00")).toBeInTheDocument();
    });

    // Remove the chapter
    await user.click(screen.getByText("\u00d7"));

    await waitFor(() => {
      expect(screen.getByText("No chapters — audio will be extracted as a single file")).toBeInTheDocument();
    });
  });

  it("disables extract when no output folder is selected", async () => {
    mockOpen.mockResolvedValueOnce("/path/to/video.mp4");
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === "check_ffmpeg") return Promise.resolve();
      if (cmd === "probe_video") return Promise.resolve(VIDEO_PROBE);
      return Promise.resolve();
    });

    render(<VideoExtractor />);
    await waitFor(() => screen.getByText("No file selected"));
    await userEvent.setup().click(screen.getByText("No file selected").closest("div")!);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Extract Audio" })).toBeDisabled();
    });
  });

  it("extracts audio without chapters", async () => {
    const user = userEvent.setup();
    // First call: video file, second call: output directory
    mockOpen.mockResolvedValueOnce("/path/to/video.mp4").mockResolvedValueOnce("/output");
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === "check_ffmpeg") return Promise.resolve();
      if (cmd === "probe_video") return Promise.resolve(VIDEO_PROBE);
      if (cmd === "extract_audio_from_video")
        return Promise.resolve({
          success: true,
          cancelled: false,
          file_paths: ["/output/My Concert.flac"],
          error: null,
        });
      return Promise.resolve();
    });

    render(<VideoExtractor />);
    await waitFor(() => screen.getByText("No file selected"));

    // Pick video
    await user.click(screen.getByText("No file selected").closest("div")!);
    await waitFor(() => screen.getByText("My Concert"));

    // Pick output
    await user.click(screen.getByRole("button", { name: "Browse" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Extract Audio" })).toBeEnabled());
    await user.click(screen.getByRole("button", { name: "Extract Audio" }));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith("extract_audio_from_video", {
        path: "/path/to/video.mp4",
        outputDir: "/output",
        format: "flac",
        chapters: [],
      });
      expect(screen.getByText("Extraction complete — 1 audio file created")).toBeInTheDocument();
    });
  });

  it("extracts with chapters and validates timestamps", async () => {
    const user = userEvent.setup();
    mockOpen.mockResolvedValueOnce("/path/to/video.mp4").mockResolvedValueOnce("/output");
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === "check_ffmpeg") return Promise.resolve();
      if (cmd === "probe_video") return Promise.resolve(VIDEO_PROBE);
      if (cmd === "extract_audio_from_video")
        return Promise.resolve({
          success: true,
          cancelled: false,
          file_paths: ["/output/My Concert/01. Intro.flac", "/output/My Concert/02. Main.flac"],
          error: null,
        });
      return Promise.resolve();
    });

    render(<VideoExtractor />);
    await waitFor(() => screen.getByText("No file selected"));
    await user.click(screen.getByText("No file selected").closest("div")!);
    await waitFor(() => screen.getByText("+ Add Chapter"));

    // Add two chapters
    await user.click(screen.getByText("+ Add Chapter"));
    await user.click(screen.getByText("+ Add Chapter"));

    const titleInputs = screen.getAllByPlaceholderText(/Chapter/);
    const timeInputs = screen.getAllByPlaceholderText("0:00");

    await user.type(titleInputs[0], "Intro");
    await user.type(timeInputs[0], "0:00");
    await user.type(titleInputs[1], "Main");
    await user.type(timeInputs[1], "3:00");

    // Pick output
    await user.click(screen.getByRole("button", { name: "Browse" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Extract 2 Tracks" })).toBeEnabled());
    await user.click(screen.getByRole("button", { name: "Extract 2 Tracks" }));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith("extract_audio_from_video", {
        path: "/path/to/video.mp4",
        outputDir: "/output",
        format: "flac",
        chapters: [
          { title: "Intro", start_time: 0, end_time: 180 },
          { title: "Main", start_time: 180, end_time: 600 },
        ],
      });
    });
  });

  it("shows error for invalid chapter timestamps", async () => {
    const user = userEvent.setup();
    mockOpen.mockResolvedValueOnce("/path/to/video.mp4").mockResolvedValueOnce("/output");
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === "check_ffmpeg") return Promise.resolve();
      if (cmd === "probe_video") return Promise.resolve(VIDEO_PROBE);
      return Promise.resolve();
    });

    render(<VideoExtractor />);
    await waitFor(() => screen.getByText("No file selected"));
    await user.click(screen.getByText("No file selected").closest("div")!);
    await waitFor(() => screen.getByText("+ Add Chapter"));

    await user.click(screen.getByText("+ Add Chapter"));
    const timeInput = screen.getByPlaceholderText("0:00");
    await user.type(timeInput, "99:99");

    await user.click(screen.getByRole("button", { name: "Browse" }));
    await waitFor(() => screen.getByRole("button", { name: "Extract 1 Tracks" }));
    await user.click(screen.getByRole("button", { name: "Extract 1 Tracks" }));

    await waitFor(() => {
      expect(screen.getByText(/Invalid format/)).toBeInTheDocument();
    });
  });

  it("shows error for timestamp exceeding video duration", async () => {
    const user = userEvent.setup();
    mockOpen.mockResolvedValueOnce("/path/to/video.mp4").mockResolvedValueOnce("/output");
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === "check_ffmpeg") return Promise.resolve();
      if (cmd === "probe_video") return Promise.resolve(VIDEO_PROBE);
      return Promise.resolve();
    });

    render(<VideoExtractor />);
    await waitFor(() => screen.getByText("No file selected"));
    await user.click(screen.getByText("No file selected").closest("div")!);
    await waitFor(() => screen.getByText("+ Add Chapter"));

    await user.click(screen.getByText("+ Add Chapter"));
    const timeInput = screen.getByPlaceholderText("0:00");
    await user.type(timeInput, "15:00");

    await user.click(screen.getByRole("button", { name: "Browse" }));
    await waitFor(() => screen.getByRole("button", { name: "Extract 1 Tracks" }));
    await user.click(screen.getByRole("button", { name: "Extract 1 Tracks" }));

    await waitFor(() => {
      expect(screen.getByText(/Exceeds video length/)).toBeInTheDocument();
    });
  });

  it("cancel calls cancel_sync during extraction", async () => {
    const user = userEvent.setup();
    mockOpen.mockResolvedValueOnce("/path/to/video.mp4").mockResolvedValueOnce("/output");
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === "check_ffmpeg") return Promise.resolve();
      if (cmd === "probe_video") return Promise.resolve(VIDEO_PROBE);
      if (cmd === "extract_audio_from_video") return new Promise(() => {});
      if (cmd === "cancel_sync") return Promise.resolve();
      return Promise.resolve();
    });

    render(<VideoExtractor />);
    await waitFor(() => screen.getByText("No file selected"));
    await user.click(screen.getByText("No file selected").closest("div")!);
    await waitFor(() => screen.getByText("My Concert"));
    await user.click(screen.getByRole("button", { name: "Browse" }));
    await waitFor(() => screen.getByRole("button", { name: "Extract Audio" }));
    await user.click(screen.getByRole("button", { name: "Extract Audio" }));

    await waitFor(() => screen.getByRole("button", { name: "Cancel" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(mockInvoke).toHaveBeenCalledWith("cancel_sync");
  });

  it("format toggle switches between FLAC and MP3", async () => {
    const user = userEvent.setup();
    render(<VideoExtractor />);
    await waitFor(() => screen.getByText("44.1 kHz / 16-bit"));

    await user.click(screen.getByRole("button", { name: "MP3" }));
    expect(screen.getByText("320 kbps")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "FLAC" }));
    expect(screen.getByText("44.1 kHz / 16-bit")).toBeInTheDocument();
  });
});

describe("parseTimestamp", () => {
  it("parses M:SS format", () => {
    expect(parseTimestamp("1:23")).toBe(83);
    expect(parseTimestamp("0:00")).toBe(0);
    expect(parseTimestamp("10:30")).toBe(630);
  });

  it("parses H:MM:SS format", () => {
    expect(parseTimestamp("1:00:00")).toBe(3600);
    expect(parseTimestamp("0:05:30")).toBe(330);
  });

  it("rejects invalid formats", () => {
    expect(parseTimestamp("")).toBeNull();
    expect(parseTimestamp("abc")).toBeNull();
    expect(parseTimestamp("1:60")).toBeNull();
    expect(parseTimestamp("1:2:3:4")).toBeNull();
  });

  it("rejects negative values", () => {
    expect(parseTimestamp("-1:00")).toBeNull();
  });
});

describe("formatDuration", () => {
  it("formats seconds under an hour", () => {
    expect(formatDuration(0)).toBe("0:00");
    expect(formatDuration(65)).toBe("1:05");
    expect(formatDuration(600)).toBe("10:00");
  });

  it("formats seconds over an hour", () => {
    expect(formatDuration(3661)).toBe("1:01:01");
  });
});

describe("buildChapters", () => {
  it("builds chapters with correct end times", () => {
    const editable = [
      { id: 1, title: "Intro", timestamp: "0:00" },
      { id: 2, title: "Main", timestamp: "3:00" },
    ];
    const { chapters, errors } = buildChapters(editable, 600);
    expect(Object.keys(errors).length).toBe(0);
    expect(chapters).toEqual([
      { title: "Intro", start_time: 0, end_time: 180 },
      { title: "Main", start_time: 180, end_time: 600 },
    ]);
  });

  it("rejects timestamps exceeding duration", () => {
    const editable = [{ id: 1, title: "Late", timestamp: "15:00" }];
    const { errors } = buildChapters(editable, 600);
    expect(errors[1]).toBeDefined();
    expect(errors[1]).toContain("Exceeds video length");
  });

  it("rejects out-of-order timestamps", () => {
    const editable = [
      { id: 1, title: "First", timestamp: "3:00" },
      { id: 2, title: "Second", timestamp: "1:00" },
    ];
    const { errors } = buildChapters(editable, 600);
    expect(errors[2]).toBeDefined();
    expect(errors[2]).toContain("Must be after previous chapter");
  });

  it("uses default title when empty", () => {
    const editable = [{ id: 1, title: "", timestamp: "0:00" }];
    const { chapters } = buildChapters(editable, 600);
    expect(chapters[0].title).toBe("Chapter 1");
  });
});
