import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { WaveformCanvas } from "./WaveformCanvas";

const MOCK_PEAKS: [number, number][] = [
  [-0.5, 0.8],
  [-0.3, 0.6],
  [-0.9, 0.2],
  [-0.1, 0.4],
];

describe("WaveformCanvas", () => {
  it("renders a canvas element", () => {
    render(<WaveformCanvas peaks={MOCK_PEAKS} width={400} height={100} />);
    expect(screen.getByTestId("waveform-canvas")).toBeInTheDocument();
  });

  it("applies correct CSS dimensions", () => {
    render(<WaveformCanvas peaks={MOCK_PEAKS} width={400} height={100} />);
    const canvas = screen.getByTestId("waveform-canvas") as HTMLCanvasElement;
    expect(canvas.style.width).toBe("400px");
    expect(canvas.style.height).toBe("100px");
  });

  it("fires onClick with fraction on click", () => {
    const onClick = vi.fn();
    render(<WaveformCanvas peaks={MOCK_PEAKS} width={400} height={100} onClick={onClick} />);
    const canvas = screen.getByTestId("waveform-canvas");

    // Mock getBoundingClientRect
    vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue({
      left: 0,
      right: 400,
      top: 0,
      bottom: 100,
      width: 400,
      height: 100,
      x: 0,
      y: 0,
      toJSON: () => {},
    });

    fireEvent.click(canvas, { clientX: 200, clientY: 50 });
    expect(onClick).toHaveBeenCalledWith(0.5);
  });

  it("has cursor-pointer class when onClick is provided", () => {
    render(<WaveformCanvas peaks={MOCK_PEAKS} width={400} height={100} onClick={() => {}} />);
    const canvas = screen.getByTestId("waveform-canvas");
    expect(canvas.className).toContain("cursor-pointer");
  });

  it("handles empty peaks without crashing", () => {
    render(<WaveformCanvas peaks={[]} width={400} height={100} />);
    expect(screen.getByTestId("waveform-canvas")).toBeInTheDocument();
  });
});
