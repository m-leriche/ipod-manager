import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { HealthCard } from "./HealthCard";

describe("HealthCard", () => {
  it("renders the label, count, and percentage", () => {
    render(
      <HealthCard
        issue={{ id: "missing_year", label: "Missing year", count: 250 }}
        totalTracks={1000}
        onSelect={vi.fn()}
      />,
    );
    expect(screen.getByText("Missing year")).toBeInTheDocument();
    expect(screen.getByText("250")).toBeInTheDocument();
    expect(screen.getByText("25.0%")).toBeInTheDocument();
  });

  it("calls onSelect when clicked and count is non-zero", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const issue = { id: "missing_title", label: "Missing title", count: 5 };
    render(<HealthCard issue={issue} totalTracks={1000} onSelect={onSelect} />);
    await user.click(screen.getByRole("button"));
    expect(onSelect).toHaveBeenCalledWith(issue);
  });

  it("is disabled and does not fire onSelect when count is zero", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <HealthCard
        issue={{ id: "missing_title", label: "Missing title", count: 0 }}
        totalTracks={1000}
        onSelect={onSelect}
      />,
    );
    const button = screen.getByRole("button");
    expect(button).toBeDisabled();
    await user.click(button).catch(() => {});
    expect(onSelect).not.toHaveBeenCalled();
  });
});
