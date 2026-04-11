import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { FilterChip } from "./FilterChip";

describe("FilterChip", () => {
  it("renders the path", () => {
    render(<FilterChip path="Podcasts" onRemove={vi.fn()} />);
    expect(screen.getByText("Podcasts")).toBeInTheDocument();
  });

  it("calls onRemove when x is clicked", async () => {
    const user = userEvent.setup();
    const onRemove = vi.fn();
    render(<FilterChip path="Podcasts" onRemove={onRemove} />);
    await user.click(screen.getByLabelText("Remove filter Podcasts"));
    expect(onRemove).toHaveBeenCalled();
  });
});
