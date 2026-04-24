import { render, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { SeekBar } from "./SeekBar";

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
});
