import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { StarRating } from "./StarRating";

describe("StarRating", () => {
  it("renders 5 star buttons", () => {
    render(<StarRating rating={3} />);
    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(5);
  });

  it("shows dash when rating is 0 and not interactive", () => {
    render(<StarRating rating={0} />);
    expect(screen.getByText("-")).toBeInTheDocument();
  });

  it("calls onChange with the clicked star value", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<StarRating rating={0} onChange={onChange} />);
    const buttons = screen.getAllByRole("button");
    await user.click(buttons[2]); // 3rd star
    expect(onChange).toHaveBeenCalledWith(3);
  });

  it("clears rating when clicking the current rating", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<StarRating rating={3} onChange={onChange} />);
    const buttons = screen.getAllByRole("button");
    await user.click(buttons[2]); // Click star 3 again
    expect(onChange).toHaveBeenCalledWith(0);
  });

  it("renders all stars when interactive even with rating 0", () => {
    render(<StarRating rating={0} onChange={vi.fn()} />);
    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(5);
  });
});
