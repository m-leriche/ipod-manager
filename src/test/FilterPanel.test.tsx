import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { FilterPanel } from "../components/organisms/FilterPanel";

describe("FilterPanel", () => {
  it("shows empty state when no exclusions", () => {
    render(<FilterPanel exclusions={[]} onRemove={vi.fn()} />);
    expect(
      screen.getByText("No filters — right-click folders in comparison to add")
    ).toBeInTheDocument();
  });

  it("renders exclusion chips", () => {
    render(<FilterPanel exclusions={["Podcasts", "Music/Archive"]} onRemove={vi.fn()} />);
    expect(screen.getByText("Podcasts")).toBeInTheDocument();
    expect(screen.getByText("Music/Archive")).toBeInTheDocument();
  });

  it("calls onRemove when chip x is clicked", async () => {
    const user = userEvent.setup();
    const onRemove = vi.fn();
    render(<FilterPanel exclusions={["Podcasts"]} onRemove={onRemove} />);
    await user.click(screen.getByLabelText("Remove filter Podcasts"));
    expect(onRemove).toHaveBeenCalledWith("Podcasts");
  });

  it("shows header when exclusions exist", () => {
    render(<FilterPanel exclusions={["Podcasts"]} onRemove={vi.fn()} />);
    expect(screen.getByText("Excluded Folders")).toBeInTheDocument();
  });
});
