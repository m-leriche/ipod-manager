import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { YouTubeDownloader } from "./YouTubeDownloader";
import { isValidYouTubeUrl, formatSeconds, fileNameFromPath } from "./helpers";

const mockInvoke = vi.mocked(invoke);
const mockOpen = vi.mocked(open);

beforeEach(() => {
  mockInvoke.mockReset();
  mockOpen.mockReset();
  // Default: deps check passes
  mockInvoke.mockImplementation((cmd) => {
    if (cmd === "check_yt_dependencies") return Promise.resolve();
    return Promise.resolve();
  });
});

const VIDEO_INFO = {
  title: "Test Video Title",
  duration: "3:45",
  uploader: "Test Channel",
  chapters: [],
};

const VIDEO_INFO_WITH_CHAPTERS = {
  title: "Live Concert",
  duration: "15:00",
  uploader: "Test Channel",
  chapters: [
    { title: "Song One", start_time: 0, end_time: 180 },
    { title: "Song Two", start_time: 180, end_time: 360 },
    { title: "Song Three", start_time: 360, end_time: 540 },
  ],
};

describe("YouTubeDownloader", () => {
  it("shows dependency check spinner initially", () => {
    mockInvoke.mockImplementation(() => new Promise(() => {})); // never resolves
    render(<YouTubeDownloader />);
    expect(screen.getByText("Checking dependencies...")).toBeInTheDocument();
  });

  it("shows dependency error when tools are missing", async () => {
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === "check_yt_dependencies") {
        return Promise.reject("Missing required tools: yt-dlp. Install with: brew install yt-dlp");
      }
      return Promise.resolve();
    });

    render(<YouTubeDownloader />);

    await waitFor(() => {
      expect(screen.getByText("Missing required tools")).toBeInTheDocument();
      expect(screen.getByText("brew install yt-dlp ffmpeg")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
    });
  });

  it("renders idle state with URL input and download button", async () => {
    render(<YouTubeDownloader />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText("https://www.youtube.com/watch?v=...")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Download" })).toBeInTheDocument();
      expect(screen.getByText("No folder selected")).toBeInTheDocument();
    });
  });

  it("disables download when URL is empty", async () => {
    render(<YouTubeDownloader />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Download" })).toBeDisabled();
    });
  });

  it("disables download when no output folder is selected", async () => {
    const user = userEvent.setup();
    render(<YouTubeDownloader />);

    await waitFor(() => screen.getByPlaceholderText("https://www.youtube.com/watch?v=..."));

    await user.type(
      screen.getByPlaceholderText("https://www.youtube.com/watch?v=..."),
      "https://www.youtube.com/watch?v=test123",
    );

    expect(screen.getByRole("button", { name: "Download" })).toBeDisabled();
  });

  it("enables download when URL and folder are provided", async () => {
    const user = userEvent.setup();
    mockOpen.mockResolvedValue("/output");

    render(<YouTubeDownloader />);
    await waitFor(() => screen.getByPlaceholderText("https://www.youtube.com/watch?v=..."));

    await user.type(
      screen.getByPlaceholderText("https://www.youtube.com/watch?v=..."),
      "https://www.youtube.com/watch?v=test123",
    );
    await user.click(screen.getByRole("button", { name: "Browse" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Download" })).toBeEnabled();
    });
  });

  it("fetches video info on download click", async () => {
    const user = userEvent.setup();
    mockOpen.mockResolvedValue("/output");
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === "check_yt_dependencies") return Promise.resolve();
      if (cmd === "fetch_video_info") return Promise.resolve(VIDEO_INFO);
      return Promise.resolve();
    });

    render(<YouTubeDownloader />);
    await waitFor(() => screen.getByPlaceholderText("https://www.youtube.com/watch?v=..."));

    await user.type(
      screen.getByPlaceholderText("https://www.youtube.com/watch?v=..."),
      "https://www.youtube.com/watch?v=test123",
    );
    await user.click(screen.getByRole("button", { name: "Browse" }));

    await waitFor(() => screen.getByRole("button", { name: "Download" }));
    await user.click(screen.getByRole("button", { name: "Download" }));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith("fetch_video_info", {
        url: "https://www.youtube.com/watch?v=test123",
      });
    });
  });

  it("shows video info after fetch", async () => {
    const user = userEvent.setup();
    mockOpen.mockResolvedValue("/output");
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === "check_yt_dependencies") return Promise.resolve();
      if (cmd === "fetch_video_info") return Promise.resolve(VIDEO_INFO);
      return Promise.resolve();
    });

    render(<YouTubeDownloader />);
    await waitFor(() => screen.getByPlaceholderText("https://www.youtube.com/watch?v=..."));

    await user.type(
      screen.getByPlaceholderText("https://www.youtube.com/watch?v=..."),
      "https://www.youtube.com/watch?v=test123",
    );
    await user.click(screen.getByRole("button", { name: "Browse" }));
    await waitFor(() => screen.getByRole("button", { name: "Download" }));
    await user.click(screen.getByRole("button", { name: "Download" }));

    await waitFor(() => {
      expect(screen.getByText("Test Video Title")).toBeInTheDocument();
      expect(screen.getByText("Test Channel — 3:45")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Download as FLAC" })).toBeInTheDocument();
    });
  });

  it("shows error when fetch fails", async () => {
    const user = userEvent.setup();
    mockOpen.mockResolvedValue("/output");
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === "check_yt_dependencies") return Promise.resolve();
      if (cmd === "fetch_video_info") return Promise.reject("Video not found");
      return Promise.resolve();
    });

    render(<YouTubeDownloader />);
    await waitFor(() => screen.getByPlaceholderText("https://www.youtube.com/watch?v=..."));

    await user.type(
      screen.getByPlaceholderText("https://www.youtube.com/watch?v=..."),
      "https://www.youtube.com/watch?v=test123",
    );
    await user.click(screen.getByRole("button", { name: "Browse" }));
    await waitFor(() => screen.getByRole("button", { name: "Download" }));
    await user.click(screen.getByRole("button", { name: "Download" }));

    await waitFor(() => {
      expect(screen.getByText("Video not found")).toBeInTheDocument();
    });
  });

  it("calls download_audio with correct params", async () => {
    const user = userEvent.setup();
    mockOpen.mockResolvedValue("/output");
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === "check_yt_dependencies") return Promise.resolve();
      if (cmd === "fetch_video_info") return Promise.resolve(VIDEO_INFO);
      if (cmd === "download_audio")
        return Promise.resolve({ success: true, cancelled: false, file_paths: ["/output/test.flac"], error: null });
      return Promise.resolve();
    });

    render(<YouTubeDownloader />);
    await waitFor(() => screen.getByPlaceholderText("https://www.youtube.com/watch?v=..."));

    await user.type(
      screen.getByPlaceholderText("https://www.youtube.com/watch?v=..."),
      "https://www.youtube.com/watch?v=test123",
    );
    await user.click(screen.getByRole("button", { name: "Browse" }));
    await waitFor(() => screen.getByRole("button", { name: "Download" }));
    await user.click(screen.getByRole("button", { name: "Download" }));

    await waitFor(() => screen.getByRole("button", { name: "Download as FLAC" }));
    await user.click(screen.getByRole("button", { name: "Download as FLAC" }));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith("download_audio", {
        url: "https://www.youtube.com/watch?v=test123",
        outputDir: "/output",
        format: "flac",
        splitChapters: false,
        chapterCount: 0,
      });
    });
  });

  it("shows no-chapters message after single file download", async () => {
    const user = userEvent.setup();
    mockOpen.mockResolvedValue("/output");
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === "check_yt_dependencies") return Promise.resolve();
      if (cmd === "fetch_video_info") return Promise.resolve(VIDEO_INFO);
      if (cmd === "download_audio")
        return Promise.resolve({ success: true, cancelled: false, file_paths: ["/output/test.flac"], error: null });
      return Promise.resolve();
    });

    render(<YouTubeDownloader />);
    await waitFor(() => screen.getByPlaceholderText("https://www.youtube.com/watch?v=..."));

    await user.type(
      screen.getByPlaceholderText("https://www.youtube.com/watch?v=..."),
      "https://www.youtube.com/watch?v=test123",
    );
    await user.click(screen.getByRole("button", { name: "Browse" }));
    await waitFor(() => screen.getByRole("button", { name: "Download" }));
    await user.click(screen.getByRole("button", { name: "Download" }));

    await waitFor(() => screen.getByRole("button", { name: "Download as FLAC" }));
    await user.click(screen.getByRole("button", { name: "Download as FLAC" }));

    await waitFor(() => {
      expect(screen.getByText("No chapters found. One audio file created.")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "OK" })).toBeInTheDocument();
    });
  });

  it("format toggle switches between FLAC and MP3", async () => {
    const user = userEvent.setup();
    mockOpen.mockResolvedValue("/output");
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === "check_yt_dependencies") return Promise.resolve();
      if (cmd === "fetch_video_info") return Promise.resolve(VIDEO_INFO);
      return Promise.resolve();
    });

    render(<YouTubeDownloader />);
    await waitFor(() => screen.getByPlaceholderText("https://www.youtube.com/watch?v=..."));

    // Default should show FLAC info
    expect(screen.getByText("44.1 kHz / 16-bit")).toBeInTheDocument();

    // Switch to MP3
    await user.click(screen.getByRole("button", { name: "MP3" }));
    expect(screen.getByText("320 kbps")).toBeInTheDocument();

    // Switch back to FLAC
    await user.click(screen.getByRole("button", { name: "FLAC" }));
    expect(screen.getByText("44.1 kHz / 16-bit")).toBeInTheDocument();
  });

  it("shows chapters in ready state when detected", async () => {
    const user = userEvent.setup();
    mockOpen.mockResolvedValue("/output");
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === "check_yt_dependencies") return Promise.resolve();
      if (cmd === "fetch_video_info") return Promise.resolve(VIDEO_INFO_WITH_CHAPTERS);
      return Promise.resolve();
    });

    render(<YouTubeDownloader />);
    await waitFor(() => screen.getByPlaceholderText("https://www.youtube.com/watch?v=..."));

    await user.type(
      screen.getByPlaceholderText("https://www.youtube.com/watch?v=..."),
      "https://www.youtube.com/watch?v=test123",
    );
    await user.click(screen.getByRole("button", { name: "Browse" }));
    await waitFor(() => screen.getByRole("button", { name: "Download" }));
    await user.click(screen.getByRole("button", { name: "Download" }));

    await waitFor(() => {
      expect(screen.getByText("3 chapters — will split into individual tracks")).toBeInTheDocument();
      expect(screen.getByText("Song One")).toBeInTheDocument();
      expect(screen.getByText("Song Two")).toBeInTheDocument();
      expect(screen.getByText("Song Three")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Download 3 tracks as FLAC" })).toBeInTheDocument();
    });
  });

  it("passes splitChapters true when chapters exist", async () => {
    const user = userEvent.setup();
    mockOpen.mockResolvedValue("/output");
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === "check_yt_dependencies") return Promise.resolve();
      if (cmd === "fetch_video_info") return Promise.resolve(VIDEO_INFO_WITH_CHAPTERS);
      if (cmd === "download_audio")
        return Promise.resolve({
          success: true,
          cancelled: false,
          file_paths: ["/output/Song One.flac", "/output/Song Two.flac", "/output/Song Three.flac"],
          error: null,
        });
      return Promise.resolve();
    });

    render(<YouTubeDownloader />);
    await waitFor(() => screen.getByPlaceholderText("https://www.youtube.com/watch?v=..."));

    await user.type(
      screen.getByPlaceholderText("https://www.youtube.com/watch?v=..."),
      "https://www.youtube.com/watch?v=test123",
    );
    await user.click(screen.getByRole("button", { name: "Browse" }));
    await waitFor(() => screen.getByRole("button", { name: "Download" }));
    await user.click(screen.getByRole("button", { name: "Download" }));

    await waitFor(() => screen.getByRole("button", { name: "Download 3 tracks as FLAC" }));
    await user.click(screen.getByRole("button", { name: "Download 3 tracks as FLAC" }));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith("download_audio", {
        url: "https://www.youtube.com/watch?v=test123",
        outputDir: "/output",
        format: "flac",
        splitChapters: true,
        chapterCount: 3,
      });
    });
  });

  it("shows multiple tracks in done state after chapter split", async () => {
    const user = userEvent.setup();
    mockOpen.mockResolvedValue("/output");
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === "check_yt_dependencies") return Promise.resolve();
      if (cmd === "fetch_video_info") return Promise.resolve(VIDEO_INFO_WITH_CHAPTERS);
      if (cmd === "download_audio")
        return Promise.resolve({
          success: true,
          cancelled: false,
          file_paths: ["/output/Song One.flac", "/output/Song Two.flac", "/output/Song Three.flac"],
          error: null,
        });
      return Promise.resolve();
    });

    render(<YouTubeDownloader />);
    await waitFor(() => screen.getByPlaceholderText("https://www.youtube.com/watch?v=..."));

    await user.type(
      screen.getByPlaceholderText("https://www.youtube.com/watch?v=..."),
      "https://www.youtube.com/watch?v=test123",
    );
    await user.click(screen.getByRole("button", { name: "Browse" }));
    await waitFor(() => screen.getByRole("button", { name: "Download" }));
    await user.click(screen.getByRole("button", { name: "Download" }));

    await waitFor(() => screen.getByRole("button", { name: "Download 3 tracks as FLAC" }));
    await user.click(screen.getByRole("button", { name: "Download 3 tracks as FLAC" }));

    await waitFor(() => {
      expect(screen.getByText("Download complete — 3 tracks")).toBeInTheDocument();
      expect(screen.getByText("Song One.flac")).toBeInTheDocument();
      expect(screen.getByText("Song Two.flac")).toBeInTheDocument();
      expect(screen.getByText("Song Three.flac")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Download Another" })).toBeInTheDocument();
    });
  });

  it("cancel calls cancel_sync during download", async () => {
    const user = userEvent.setup();
    mockOpen.mockResolvedValue("/output");
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === "check_yt_dependencies") return Promise.resolve();
      if (cmd === "fetch_video_info") return Promise.resolve(VIDEO_INFO);
      if (cmd === "download_audio") return new Promise(() => {}); // never resolves
      if (cmd === "cancel_sync") return Promise.resolve();
      return Promise.resolve();
    });

    render(<YouTubeDownloader />);
    await waitFor(() => screen.getByPlaceholderText("https://www.youtube.com/watch?v=..."));

    await user.type(
      screen.getByPlaceholderText("https://www.youtube.com/watch?v=..."),
      "https://www.youtube.com/watch?v=test123",
    );
    await user.click(screen.getByRole("button", { name: "Browse" }));
    await waitFor(() => screen.getByRole("button", { name: "Download" }));
    await user.click(screen.getByRole("button", { name: "Download" }));

    await waitFor(() => screen.getByRole("button", { name: "Download as FLAC" }));
    await user.click(screen.getByRole("button", { name: "Download as FLAC" }));

    await waitFor(() => screen.getByRole("button", { name: "Cancel" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(mockInvoke).toHaveBeenCalledWith("cancel_sync");
  });
});

describe("isValidYouTubeUrl", () => {
  it("accepts youtube.com watch URLs", () => {
    expect(isValidYouTubeUrl("https://www.youtube.com/watch?v=abc123")).toBe(true);
  });

  it("accepts youtu.be short URLs", () => {
    expect(isValidYouTubeUrl("https://youtu.be/abc123")).toBe(true);
  });

  it("accepts music.youtube.com URLs", () => {
    expect(isValidYouTubeUrl("https://music.youtube.com/watch?v=abc123")).toBe(true);
  });

  it("accepts youtube.com shorts URLs", () => {
    expect(isValidYouTubeUrl("https://www.youtube.com/shorts/abc123")).toBe(true);
  });

  it("rejects non-YouTube URLs", () => {
    expect(isValidYouTubeUrl("https://vimeo.com/123")).toBe(false);
    expect(isValidYouTubeUrl("https://google.com")).toBe(false);
  });

  it("rejects invalid URLs", () => {
    expect(isValidYouTubeUrl("not a url")).toBe(false);
    expect(isValidYouTubeUrl("")).toBe(false);
  });
});

describe("formatSeconds", () => {
  it("formats zero", () => {
    expect(formatSeconds(0)).toBe("0:00");
  });

  it("formats seconds under a minute", () => {
    expect(formatSeconds(45)).toBe("0:45");
  });

  it("formats minutes and seconds", () => {
    expect(formatSeconds(185)).toBe("3:05");
  });

  it("pads single-digit seconds", () => {
    expect(formatSeconds(62)).toBe("1:02");
  });
});

describe("fileNameFromPath", () => {
  it("extracts filename from absolute path", () => {
    expect(fileNameFromPath("/output/Song One.flac")).toBe("Song One.flac");
  });

  it("returns input when no slashes", () => {
    expect(fileNameFromPath("file.flac")).toBe("file.flac");
  });
});
