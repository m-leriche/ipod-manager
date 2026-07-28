import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { DensityStepper } from "./DensityStepper";
import { MIN_SIDE_COUNT, MAX_SIDE_COUNT } from "./constants";

describe("DensityStepper", () => {
  it("shows the total number of visible covers", () => {
    render(<DensityStepper sideCount={3} onChange={vi.fn()} />);
    expect(screen.getByLabelText("Visible covers")).toHaveTextContent("7");
  });

  it("steps the side count up and down", () => {
    const onChange = vi.fn();
    render(<DensityStepper sideCount={4} onChange={onChange} />);
    fireEvent.click(screen.getByLabelText("More covers"));
    expect(onChange).toHaveBeenCalledWith(5);
    fireEvent.click(screen.getByLabelText("Fewer covers"));
    expect(onChange).toHaveBeenCalledWith(3);
  });

  it("disables stepping past the bounds", () => {
    const { unmount } = render(<DensityStepper sideCount={MIN_SIDE_COUNT} onChange={vi.fn()} />);
    expect(screen.getByLabelText("Fewer covers")).toBeDisabled();
    expect(screen.getByLabelText("More covers")).toBeEnabled();
    unmount();

    render(<DensityStepper sideCount={MAX_SIDE_COUNT} onChange={vi.fn()} />);
    expect(screen.getByLabelText("More covers")).toBeDisabled();
    expect(screen.getByLabelText("Fewer covers")).toBeEnabled();
  });
});
