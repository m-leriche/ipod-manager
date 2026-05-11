import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { FullscreenVisualizer } from "./FullscreenVisualizer";

describe("FullscreenVisualizer", () => {
  it("renders close button", () => {
    const onClose = vi.fn();
    render(<FullscreenVisualizer onClose={onClose} />);
    const closeBtn = screen.getByTitle("Close visualizer (Esc)");
    expect(closeBtn).toBeInTheDocument();
  });

  it("calls onClose when close button is clicked", () => {
    const onClose = vi.fn();
    render(<FullscreenVisualizer onClose={onClose} />);
    fireEvent.click(screen.getByTitle("Close visualizer (Esc)"));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("shows empty state when no track is playing", () => {
    render(<FullscreenVisualizer onClose={() => {}} />);
    expect(screen.getByText("Play a track to see the visualizer")).toBeInTheDocument();
  });
});
