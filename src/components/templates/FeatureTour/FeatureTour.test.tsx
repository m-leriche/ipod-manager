import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { FeatureTour } from "./FeatureTour";
import { TOUR_STEPS } from "./constants";
import { getSetting } from "../../../utils/settings";

describe("FeatureTour", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("starts on the first step", () => {
    render(<FeatureTour onClose={vi.fn()} />);
    expect(screen.getByText(TOUR_STEPS[0].title)).toBeInTheDocument();
    expect(screen.getByText(`Step 1 of ${TOUR_STEPS.length}`)).toBeInTheDocument();
  });

  it("advances through steps with Next and shows Back after the first", async () => {
    const user = userEvent.setup();
    render(<FeatureTour onClose={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "Back" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText(TOUR_STEPS[1].title)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Back" })).toBeInTheDocument();
  });

  it("marks the tour complete and closes when finished", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<FeatureTour onClose={onClose} />);
    for (let i = 0; i < TOUR_STEPS.length - 1; i++) {
      await user.click(screen.getByRole("button", { name: "Next" }));
    }
    await user.click(screen.getByRole("button", { name: "Get started" }));
    expect(onClose).toHaveBeenCalledOnce();
    expect(getSetting("tourCompleted")).toBe(true);
  });

  it("marks complete and closes when skipped", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<FeatureTour onClose={onClose} />);
    await user.click(screen.getByRole("button", { name: "Skip" }));
    expect(onClose).toHaveBeenCalledOnce();
    expect(getSetting("tourCompleted")).toBe(true);
  });

  it("closes on Escape", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<FeatureTour onClose={onClose} />);
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledOnce();
    expect(getSetting("tourCompleted")).toBe(true);
  });
});
