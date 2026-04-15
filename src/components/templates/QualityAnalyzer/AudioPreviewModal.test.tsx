import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AudioPreviewModal } from "./AudioPreviewModal";
import type { AudioFileInfo, WaveformResult } from "../../../types/quality";
import type { AudioPlaybackState } from "../../molecules/MiniPlayer/types";

const MOCK_FILE: AudioFileInfo = {
  file_path: "/music/song.flac",
  file_name: "song.flac",
  codec: "flac",
  sample_rate: 44100,
  bit_depth: 16,
  bitrate: 900000,
  channels: 2,
  duration: 240,
  is_lossless_container: true,
  verdict: "lossless",
  verdict_reason: "FLAC 44.1kHz / 16-bit",
};

const MOCK_WAVEFORM: WaveformResult = {
  file_path: "/music/song.flac",
  peaks: [
    [-0.5, 0.8],
    [-0.3, 0.6],
  ],
  duration: 240,
};

const MOCK_AUDIO: AudioPlaybackState = {
  isPlaying: false,
  currentTime: 0,
  duration: 240,
  playbackFraction: 0,
  play: vi.fn(),
  pause: vi.fn(),
  stop: vi.fn(),
  seekTo: vi.fn(),
};

describe("AudioPreviewModal", () => {
  it("renders spectrogram mode with image", () => {
    render(<AudioPreviewModal type="spectrogram" file={MOCK_FILE} spectrogramBase64="abc123" onClose={() => {}} />);
    const img = screen.getByAltText("Audio spectrogram");
    expect(img).toBeInTheDocument();
    expect(img.getAttribute("src")).toContain("data:image/png;base64,abc123");
  });

  it("renders waveform mode with canvas", () => {
    render(
      <AudioPreviewModal
        type="waveform"
        file={MOCK_FILE}
        waveformResult={MOCK_WAVEFORM}
        audio={MOCK_AUDIO}
        onClose={() => {}}
      />,
    );
    expect(screen.getByTestId("waveform-canvas")).toBeInTheDocument();
  });

  it("shows file details in sidebar", () => {
    render(<AudioPreviewModal type="spectrogram" file={MOCK_FILE} spectrogramBase64="abc123" onClose={() => {}} />);
    expect(screen.getByText("FLAC")).toBeInTheDocument();
    expect(screen.getByText("44.1kHz")).toBeInTheDocument();
    expect(screen.getByText("Stereo")).toBeInTheDocument();
  });

  it("calls onClose when backdrop clicked", () => {
    const onClose = vi.fn();
    render(<AudioPreviewModal type="spectrogram" file={MOCK_FILE} spectrogramBase64="abc123" onClose={onClose} />);
    fireEvent.click(screen.getByTestId("preview-backdrop"));
    expect(onClose).toHaveBeenCalled();
  });

  it("calls onClose on Escape key", () => {
    const onClose = vi.fn();
    render(<AudioPreviewModal type="spectrogram" file={MOCK_FILE} spectrogramBase64="abc123" onClose={onClose} />);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  it("shows file name in header", () => {
    render(<AudioPreviewModal type="spectrogram" file={MOCK_FILE} spectrogramBase64="abc123" onClose={() => {}} />);
    expect(screen.getByText("song.flac")).toBeInTheDocument();
  });
});
