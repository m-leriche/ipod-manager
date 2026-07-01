import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { HealthSummary } from "./HealthSummary";

describe("HealthSummary", () => {
  it("shows a healthy message when there are no issues needing attention", () => {
    render(<HealthSummary totalTracks={1000} attentionCount={0} onRefresh={vi.fn()} />);
    expect(screen.getByText("Your library is healthy")).toBeInTheDocument();
    expect(screen.getByText(/1,000 tracks/)).toBeInTheDocument();
  });

  it("pluralizes the attention count", () => {
    const { rerender } = render(<HealthSummary totalTracks={1000} attentionCount={1} onRefresh={vi.fn()} />);
    expect(screen.getByText("1 issue needs attention")).toBeInTheDocument();
    rerender(<HealthSummary totalTracks={1000} attentionCount={8} onRefresh={vi.fn()} />);
    expect(screen.getByText("8 issues need attention")).toBeInTheDocument();
  });

  it("calls onRefresh when the Refresh button is clicked", async () => {
    const user = userEvent.setup();
    const onRefresh = vi.fn();
    render(<HealthSummary totalTracks={1000} attentionCount={2} onRefresh={onRefresh} />);
    await user.click(screen.getByRole("button", { name: "Refresh" }));
    expect(onRefresh).toHaveBeenCalledOnce();
  });
});
