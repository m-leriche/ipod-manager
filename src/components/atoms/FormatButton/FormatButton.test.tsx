import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { FormatButton } from "./FormatButton";

describe("FormatButton", () => {
  it("renders label", () => {
    render(<FormatButton label="FLAC" active={false} onClick={vi.fn()} />);
    expect(screen.getByText("FLAC")).toBeInTheDocument();
  });

  it("calls onClick when clicked", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<FormatButton label="MP3" active={false} onClick={onClick} />);
    await user.click(screen.getByText("MP3"));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("applies active styling when active", () => {
    render(<FormatButton label="FLAC" active={true} onClick={vi.fn()} />);
    const btn = screen.getByRole("button");
    expect(btn.className).toContain("bg-bg-card");
    expect(btn.className).toContain("border-border-active");
  });

  it("applies inactive styling when not active", () => {
    render(<FormatButton label="FLAC" active={false} onClick={vi.fn()} />);
    const btn = screen.getByRole("button");
    expect(btn.className).toContain("text-text-tertiary");
    expect(btn.className).toContain("border-transparent");
  });
});
