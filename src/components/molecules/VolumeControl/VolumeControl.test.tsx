import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { VolumeControl } from "./VolumeControl";

describe("VolumeControl", () => {
  it("renders mute icon when volume is 0", () => {
    render(<VolumeControl volume={0} onChange={vi.fn()} />);
    expect(screen.getByTitle("Unmute")).toBeInTheDocument();
  });

  it("renders volume icon when volume > 0", () => {
    render(<VolumeControl volume={0.8} onChange={vi.fn()} />);
    expect(screen.getByTitle("Mute")).toBeInTheDocument();
  });

  it("mutes on icon click when volume > 0", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<VolumeControl volume={0.8} onChange={onChange} />);
    await user.click(screen.getByTitle("Mute"));
    expect(onChange).toHaveBeenCalledWith(0);
  });

  it("unmutes to 0.8 on icon click when volume is 0", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<VolumeControl volume={0} onChange={onChange} />);
    await user.click(screen.getByTitle("Unmute"));
    expect(onChange).toHaveBeenCalledWith(0.8);
  });
});
