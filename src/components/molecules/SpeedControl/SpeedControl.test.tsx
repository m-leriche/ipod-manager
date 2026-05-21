import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { SpeedControl } from "./SpeedControl";

describe("SpeedControl", () => {
  it("shows current speed label", () => {
    render(<SpeedControl speed={1.0} onChange={vi.fn()} />);
    expect(screen.getByText("1x")).toBeInTheDocument();
  });

  it("shows non-default speed with x suffix", () => {
    render(<SpeedControl speed={1.5} onChange={vi.fn()} />);
    expect(screen.getByText("1.5x")).toBeInTheDocument();
  });

  it("opens popover on click", async () => {
    render(<SpeedControl speed={1.0} onChange={vi.fn()} />);
    await userEvent.click(screen.getByTitle("Playback speed"));
    expect(screen.getByText("Speed")).toBeInTheDocument();
    expect(screen.getByText("0.75x")).toBeInTheDocument();
    expect(screen.getByText("1.5x")).toBeInTheDocument();
  });

  it("calls onChange when a preset is selected", async () => {
    const onChange = vi.fn();
    render(<SpeedControl speed={1.0} onChange={onChange} />);
    await userEvent.click(screen.getByTitle("Playback speed"));
    await userEvent.click(screen.getByText("1.5x"));
    expect(onChange).toHaveBeenCalledWith(1.5);
  });

  it("closes popover after selecting a preset", async () => {
    render(<SpeedControl speed={1.0} onChange={vi.fn()} />);
    await userEvent.click(screen.getByTitle("Playback speed"));
    expect(screen.getByText("Speed")).toBeInTheDocument();
    await userEvent.click(screen.getByText("0.75x"));
    expect(screen.queryByText("Speed")).not.toBeInTheDocument();
  });

  it("highlights the active preset", async () => {
    render(<SpeedControl speed={1.25} onChange={vi.fn()} />);
    await userEvent.click(screen.getByTitle("Playback speed"));
    const buttons = screen.getAllByText("1.25x");
    // The popover preset button should have accent styling
    const presetButton = buttons.find((b) => b.className.includes("font-medium"));
    expect(presetButton?.className).toContain("text-accent");
  });

  it("shows all 6 speed presets in popover", async () => {
    render(<SpeedControl speed={1.0} onChange={vi.fn()} />);
    await userEvent.click(screen.getByTitle("Playback speed"));
    // Popover should render 6 preset buttons (plus the header "Speed")
    const popoverButtons = screen.getAllByRole("button").filter((b) => b.className.includes("w-full text-left"));
    expect(popoverButtons).toHaveLength(6);
  });

  it("applies accent styling for non-default speed", () => {
    const { container } = render(<SpeedControl speed={1.5} onChange={vi.fn()} />);
    const button = container.querySelector("button");
    expect(button?.className).toContain("text-accent");
  });

  it("toggles popover on repeated clicks", async () => {
    render(<SpeedControl speed={1.0} onChange={vi.fn()} />);
    const button = screen.getByTitle("Playback speed");
    await userEvent.click(button);
    expect(screen.getByText("Speed")).toBeInTheDocument();
    await userEvent.click(button);
    expect(screen.queryByText("Speed")).not.toBeInTheDocument();
  });
});
