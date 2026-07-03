import { render, fireEvent, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeAll } from "vitest";
import { SeekBar } from "./SeekBar";

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

describe("SeekBar", () => {
  it("renders with correct fill width", () => {
    const { container } = render(<SeekBar value={0.5} onChange={vi.fn()} />);
    const fill = container.querySelector("[style]");
    expect(fill?.getAttribute("style")).toContain("50");
  });

  it("renders zero fill at value 0", () => {
    const { container } = render(<SeekBar value={0} onChange={vi.fn()} />);
    const fill = container.querySelector("[style]");
    expect(fill?.getAttribute("style")).toContain("0");
  });

  it("applies className prop", () => {
    const { container } = render(<SeekBar value={0.5} onChange={vi.fn()} className="w-20" />);
    const root = container.firstElementChild;
    expect(root?.className).toContain("w-20");
  });

  it("calls onChange on mousedown + mouseup", () => {
    const onChange = vi.fn();
    const { container } = render(<SeekBar value={0} onChange={onChange} />);
    const bar = container.firstElementChild!;

    // Mock getBoundingClientRect
    vi.spyOn(bar, "getBoundingClientRect").mockReturnValue({
      left: 0,
      right: 100,
      width: 100,
      top: 0,
      bottom: 10,
      height: 10,
      x: 0,
      y: 0,
      toJSON: vi.fn(),
    });

    fireEvent.mouseDown(bar, { clientX: 50 });
    fireEvent(window, new MouseEvent("mouseup", { clientX: 50 }));

    expect(onChange).toHaveBeenCalledWith(0.5);
  });

  it("calls onScrub during drag", () => {
    const onChange = vi.fn();
    const onScrub = vi.fn();
    const { container } = render(<SeekBar value={0} onChange={onChange} onScrub={onScrub} />);
    const bar = container.firstElementChild!;

    vi.spyOn(bar, "getBoundingClientRect").mockReturnValue({
      left: 0,
      right: 100,
      width: 100,
      top: 0,
      bottom: 10,
      height: 10,
      x: 0,
      y: 0,
      toJSON: vi.fn(),
    });

    fireEvent.mouseDown(bar, { clientX: 25 });
    expect(onScrub).toHaveBeenCalledWith(0.25);

    fireEvent(window, new MouseEvent("mousemove", { clientX: 75 }));
    expect(onScrub).toHaveBeenCalledWith(0.75);

    fireEvent(window, new MouseEvent("mouseup", { clientX: 75 }));
    expect(onScrub).toHaveBeenCalledWith(null); // scrub ends
    expect(onChange).toHaveBeenCalledWith(0.75);
  });

  it("clamps value to 0-1 range", () => {
    const onChange = vi.fn();
    const { container } = render(<SeekBar value={0} onChange={onChange} />);
    const bar = container.firstElementChild!;

    vi.spyOn(bar, "getBoundingClientRect").mockReturnValue({
      left: 0,
      right: 100,
      width: 100,
      top: 0,
      bottom: 10,
      height: 10,
      x: 0,
      y: 0,
      toJSON: vi.fn(),
    });

    fireEvent.mouseDown(bar, { clientX: -50 });
    fireEvent(window, new MouseEvent("mouseup", { clientX: -50 }));
    expect(onChange).toHaveBeenCalledWith(0);

    fireEvent.mouseDown(bar, { clientX: 200 });
    fireEvent(window, new MouseEvent("mouseup", { clientX: 200 }));
    expect(onChange).toHaveBeenCalledWith(1);
  });

  it("supports keyboard arrow keys", () => {
    const onChange = vi.fn();
    const { container } = render(<SeekBar value={0.5} onChange={onChange} />);
    const bar = container.firstElementChild!;

    fireEvent.keyDown(bar, { key: "ArrowRight" });
    expect(onChange).toHaveBeenCalledWith(0.55);

    onChange.mockClear();
    fireEvent.keyDown(bar, { key: "ArrowLeft" });
    expect(onChange).toHaveBeenCalledWith(0.45);
  });

  it("supports Home and End keys", () => {
    const onChange = vi.fn();
    const { container } = render(<SeekBar value={0.5} onChange={onChange} />);
    const bar = container.firstElementChild!;

    fireEvent.keyDown(bar, { key: "Home" });
    expect(onChange).toHaveBeenCalledWith(0);

    onChange.mockClear();
    fireEvent.keyDown(bar, { key: "End" });
    expect(onChange).toHaveBeenCalledWith(1);
  });

  it("clamps keyboard values to 0-1", () => {
    const onChange = vi.fn();
    const { container } = render(<SeekBar value={0.02} onChange={onChange} />);
    const bar = container.firstElementChild!;

    fireEvent.keyDown(bar, { key: "ArrowLeft" });
    expect(onChange).toHaveBeenCalledWith(0);
  });

  it("renders a waveform track when peaks are provided", () => {
    const peaks: [number, number][] = [
      [-0.5, 0.8],
      [-0.3, 0.6],
    ];
    render(<SeekBar value={0.5} onChange={vi.fn()} peaks={peaks} />);
    expect(screen.getByTestId("waveform-seek-track")).toBeInTheDocument();
  });

  it("renders the plain track when peaks are empty", () => {
    render(<SeekBar value={0.5} onChange={vi.fn()} peaks={[]} />);
    expect(screen.queryByTestId("waveform-seek-track")).not.toBeInTheDocument();
  });
});
