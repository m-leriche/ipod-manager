import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { PlaybackButton } from "./PlaybackButton";

describe("PlaybackButton", () => {
  it("renders children", () => {
    render(<PlaybackButton onClick={vi.fn()}>Play</PlaybackButton>);
    expect(screen.getByRole("button", { name: "Play" })).toBeInTheDocument();
  });

  it("calls onClick when clicked", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<PlaybackButton onClick={onClick}>Click</PlaybackButton>);
    await user.click(screen.getByRole("button"));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("applies primary variant styling", () => {
    render(
      <PlaybackButton onClick={vi.fn()} variant="primary">
        Play
      </PlaybackButton>,
    );
    const btn = screen.getByRole("button");
    expect(btn.className).toContain("bg-text-primary");
  });

  it("applies secondary variant by default", () => {
    render(<PlaybackButton onClick={vi.fn()}>Play</PlaybackButton>);
    const btn = screen.getByRole("button");
    expect(btn.className).toContain("text-text-secondary");
  });

  it("applies size classes", () => {
    const { rerender } = render(
      <PlaybackButton onClick={vi.fn()} size="sm">
        X
      </PlaybackButton>,
    );
    expect(screen.getByRole("button").className).toContain("w-7");

    rerender(
      <PlaybackButton onClick={vi.fn()} size="lg">
        X
      </PlaybackButton>,
    );
    expect(screen.getByRole("button").className).toContain("w-11");
  });

  it("disables button when disabled", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <PlaybackButton onClick={onClick} disabled>
        Play
      </PlaybackButton>,
    );
    const btn = screen.getByRole("button");
    expect(btn).toBeDisabled();
    expect(btn.className).toContain("cursor-not-allowed");
    await user.click(btn);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("sets title attribute", () => {
    render(
      <PlaybackButton onClick={vi.fn()} title="Play track">
        Go
      </PlaybackButton>,
    );
    expect(screen.getByTitle("Play track")).toBeInTheDocument();
  });
});
