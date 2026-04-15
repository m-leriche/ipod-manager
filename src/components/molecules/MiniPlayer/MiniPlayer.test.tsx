import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MiniPlayer } from "./MiniPlayer";
import type { AudioPlaybackState } from "./types";

const MOCK_PEAKS: [number, number][] = [
  [-0.5, 0.8],
  [-0.3, 0.6],
  [-0.9, 0.2],
  [-0.1, 0.4],
];

const mockAudio: AudioPlaybackState = {
  isPlaying: false,
  currentTime: 0,
  duration: 180,
  playbackFraction: 0,
  play: vi.fn(),
  pause: vi.fn(),
  stop: vi.fn(),
  seekTo: vi.fn(),
};

describe("MiniPlayer", () => {
  it("renders play, stop, and time display", () => {
    render(<MiniPlayer audio={mockAudio} peaks={MOCK_PEAKS} duration={180} />);
    expect(screen.getByTestId("play-pause-btn")).toBeInTheDocument();
    expect(screen.getByTestId("stop-btn")).toBeInTheDocument();
    expect(screen.getByTestId("time-display")).toHaveTextContent("0:00 / 3:00");
  });

  it("renders waveform canvas", () => {
    render(<MiniPlayer audio={mockAudio} peaks={MOCK_PEAKS} duration={180} />);
    expect(screen.getByTestId("waveform-canvas")).toBeInTheDocument();
  });

  it("shows expand button when onExpand is provided", () => {
    const onExpand = vi.fn();
    render(<MiniPlayer audio={mockAudio} peaks={MOCK_PEAKS} duration={180} onExpand={onExpand} />);
    const btn = screen.getByTestId("expand-btn");
    expect(btn).toBeInTheDocument();
    fireEvent.click(btn);
    expect(onExpand).toHaveBeenCalled();
  });

  it("hides expand button when onExpand is not provided", () => {
    render(<MiniPlayer audio={mockAudio} peaks={MOCK_PEAKS} duration={180} />);
    expect(screen.queryByTestId("expand-btn")).not.toBeInTheDocument();
  });

  it("displays play icon when not playing", () => {
    render(<MiniPlayer audio={mockAudio} peaks={MOCK_PEAKS} duration={180} />);
    expect(screen.getByTestId("play-pause-btn")).toHaveTextContent("▶");
  });

  it("displays pause icon when playing", () => {
    render(<MiniPlayer audio={{ ...mockAudio, isPlaying: true }} peaks={MOCK_PEAKS} duration={180} />);
    expect(screen.getByTestId("play-pause-btn")).toHaveTextContent("⏸");
  });
});
