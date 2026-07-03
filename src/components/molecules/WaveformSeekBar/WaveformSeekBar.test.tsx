import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeAll } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { WaveformSeekBar } from "./WaveformSeekBar";

const PEAKS: [number, number][] = [
  [-0.5, 0.8],
  [-0.3, 0.6],
  [-0.9, 0.2],
];

const waveformResult = (filePath: string) => ({
  file_path: filePath,
  peaks: PEAKS,
  duration: 200,
});

beforeAll(() => {
  (globalThis as Record<string, unknown>).ResizeObserver = class {
    callback: ResizeObserverCallback;
    constructor(callback: ResizeObserverCallback) {
      this.callback = callback;
    }
    observe(target: Element) {
      this.callback(
        [{ target, contentRect: { width: 300 } } as unknown as ResizeObserverEntry],
        this as unknown as ResizeObserver,
      );
    }
    unobserve() {}
    disconnect() {}
  };
});

const mockBarRect = (bar: Element) => {
  vi.spyOn(bar, "getBoundingClientRect").mockReturnValue({
    left: 0,
    right: 100,
    width: 100,
    top: 0,
    bottom: 12,
    height: 12,
    x: 0,
    y: 0,
    toJSON: vi.fn(),
  });
};

describe("WaveformSeekBar", () => {
  it("renders the plain seek bar fallback when waveform generation fails", async () => {
    vi.mocked(invoke).mockRejectedValue(new Error("ffmpeg not found"));
    render(<WaveformSeekBar filePath="/music/fails.flac" value={0.5} onChange={vi.fn()} />);

    expect(screen.getByRole("slider")).toBeInTheDocument();
    await waitFor(() => expect(invoke).toHaveBeenCalled());
    expect(screen.queryByTestId("waveform-seek-track")).not.toBeInTheDocument();
  });

  it("renders the plain seek bar when there is no track", () => {
    render(<WaveformSeekBar filePath={null} value={0} onChange={vi.fn()} />);

    expect(screen.getByRole("slider")).toBeInTheDocument();
    expect(invoke).not.toHaveBeenCalled();
    expect(screen.queryByTestId("waveform-seek-track")).not.toBeInTheDocument();
  });

  it("fetches peaks and renders the waveform track", async () => {
    vi.mocked(invoke).mockResolvedValue(waveformResult("/music/song.flac"));
    render(<WaveformSeekBar filePath="/music/song.flac" value={0.5} onChange={vi.fn()} />);

    await waitFor(() => expect(screen.getByTestId("waveform-seek-track")).toBeInTheDocument());
    expect(invoke).toHaveBeenCalledWith("generate_waveform", { filePath: "/music/song.flac" });
  });

  it("calls onChange when clicking to seek on the waveform", async () => {
    vi.mocked(invoke).mockResolvedValue(waveformResult("/music/click.flac"));
    const onChange = vi.fn();
    render(<WaveformSeekBar filePath="/music/click.flac" value={0} onChange={onChange} />);

    await waitFor(() => expect(screen.getByTestId("waveform-seek-track")).toBeInTheDocument());

    const bar = screen.getByRole("slider");
    mockBarRect(bar);
    fireEvent.mouseDown(bar, { clientX: 50 });
    fireEvent(window, new MouseEvent("mouseup", { clientX: 50 }));

    expect(onChange).toHaveBeenCalledWith(0.5);
  });

  it("reuses cached peaks instead of regenerating for the same track", async () => {
    vi.mocked(invoke).mockResolvedValue(waveformResult("/music/cached.flac"));
    const { unmount } = render(<WaveformSeekBar filePath="/music/cached.flac" value={0} onChange={vi.fn()} />);

    await waitFor(() => expect(screen.getByTestId("waveform-seek-track")).toBeInTheDocument());
    unmount();

    render(<WaveformSeekBar filePath="/music/cached.flac" value={0} onChange={vi.fn()} />);
    expect(screen.getByTestId("waveform-seek-track")).toBeInTheDocument();
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it("ignores stale results when the track changes before peaks arrive", async () => {
    let resolveFirst: (value: unknown) => void = () => {};
    vi.mocked(invoke).mockImplementation(
      (_cmd, args) =>
        new Promise((resolve, reject) => {
          if ((args as { filePath: string }).filePath === "/music/slow.flac") {
            resolveFirst = resolve;
          } else {
            reject(new Error("no waveform"));
          }
        }),
    );

    const { rerender } = render(<WaveformSeekBar filePath="/music/slow.flac" value={0} onChange={vi.fn()} />);
    rerender(<WaveformSeekBar filePath="/music/other.flac" value={0} onChange={vi.fn()} />);

    resolveFirst(waveformResult("/music/slow.flac"));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(invoke).toHaveBeenCalledTimes(2);
    expect(screen.queryByTestId("waveform-seek-track")).not.toBeInTheDocument();
  });
});
