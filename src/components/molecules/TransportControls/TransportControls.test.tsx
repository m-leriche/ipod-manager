import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { TransportControls } from "./TransportControls";

const defaultProps = {
  isPlaying: false,
  currentTime: 0,
  duration: 180,
  shuffle: false,
  repeat: "off" as const,
  onPlayPause: vi.fn(),
  onNext: vi.fn(),
  onPrevious: vi.fn(),
  onSeek: vi.fn(),
  onToggleShuffle: vi.fn(),
  onCycleRepeat: vi.fn(),
};

describe("TransportControls", () => {
  it("shows Play title when not playing", () => {
    render(<TransportControls {...defaultProps} />);
    expect(screen.getByTitle("Play")).toBeInTheDocument();
  });

  it("shows Pause title when playing", () => {
    render(<TransportControls {...defaultProps} isPlaying={true} />);
    expect(screen.getByTitle("Pause")).toBeInTheDocument();
  });

  it("calls onPlayPause when play/pause button clicked", async () => {
    const user = userEvent.setup();
    const onPlayPause = vi.fn();
    render(<TransportControls {...defaultProps} onPlayPause={onPlayPause} />);
    await user.click(screen.getByTitle("Play"));
    expect(onPlayPause).toHaveBeenCalledOnce();
  });

  it("calls onNext when next button clicked", async () => {
    const user = userEvent.setup();
    const onNext = vi.fn();
    render(<TransportControls {...defaultProps} onNext={onNext} />);
    await user.click(screen.getByTitle("Next"));
    expect(onNext).toHaveBeenCalledOnce();
  });

  it("calls onPrevious when previous button clicked", async () => {
    const user = userEvent.setup();
    const onPrevious = vi.fn();
    render(<TransportControls {...defaultProps} onPrevious={onPrevious} />);
    await user.click(screen.getByTitle("Previous"));
    expect(onPrevious).toHaveBeenCalledOnce();
  });

  it("calls onToggleShuffle when shuffle button clicked", async () => {
    const user = userEvent.setup();
    const onToggleShuffle = vi.fn();
    render(<TransportControls {...defaultProps} onToggleShuffle={onToggleShuffle} />);
    await user.click(screen.getByTitle("Shuffle"));
    expect(onToggleShuffle).toHaveBeenCalledOnce();
  });

  it("calls onCycleRepeat when repeat button clicked", async () => {
    const user = userEvent.setup();
    const onCycleRepeat = vi.fn();
    render(<TransportControls {...defaultProps} onCycleRepeat={onCycleRepeat} />);
    await user.click(screen.getByTitle("Repeat: off"));
    expect(onCycleRepeat).toHaveBeenCalledOnce();
  });

  it("displays formatted current time", () => {
    render(<TransportControls {...defaultProps} currentTime={65} duration={180} />);
    expect(screen.getByText("1:05")).toBeInTheDocument();
  });

  it("displays formatted duration", () => {
    render(<TransportControls {...defaultProps} duration={180} />);
    expect(screen.getByText("3:00")).toBeInTheDocument();
  });

  it("displays 0:00 for zero duration", () => {
    render(<TransportControls {...defaultProps} duration={0} />);
    const zeros = screen.getAllByText("0:00");
    expect(zeros.length).toBeGreaterThanOrEqual(1);
  });

  it("shows repeat mode in title", () => {
    render(<TransportControls {...defaultProps} repeat="all" />);
    expect(screen.getByTitle("Repeat: all")).toBeInTheDocument();
  });

  it("shows '1' badge when repeat is 'one'", () => {
    render(<TransportControls {...defaultProps} repeat="one" />);
    expect(screen.getByText("1")).toBeInTheDocument();
  });

  it("does not show '1' badge when repeat is not 'one'", () => {
    render(<TransportControls {...defaultProps} repeat="all" />);
    expect(screen.queryByText("1")).not.toBeInTheDocument();
  });
});
