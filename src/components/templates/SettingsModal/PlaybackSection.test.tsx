import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PlaybackSection } from "./PlaybackSection";

describe("PlaybackSection", () => {
  it("renders the crossfade slider", () => {
    render(<PlaybackSection />);
    expect(screen.getByText("Crossfade")).toBeInTheDocument();
    expect(screen.getByTestId("crossfade-slider")).toBeInTheDocument();
  });

  it("shows 'Off' when crossfade is 0", () => {
    render(<PlaybackSection />);
    expect(screen.getByText("Off")).toBeInTheDocument();
  });

  it("crossfade slider has correct initial value and range", () => {
    render(<PlaybackSection />);
    const slider = screen.getByTestId("crossfade-slider") as HTMLInputElement;
    expect(slider.min).toBe("0");
    expect(slider.max).toBe("12");
    expect(slider.step).toBe("1");
    expect(slider.value).toBe("0");
  });

  it("renders ReplayGain toggle unchecked by default", () => {
    render(<PlaybackSection />);
    const toggle = screen.getByTestId("replay-gain-toggle") as HTMLInputElement;
    expect(toggle).toBeInTheDocument();
    expect(toggle.checked).toBe(false);
  });

  it("hides mode selector when ReplayGain is disabled", () => {
    render(<PlaybackSection />);
    expect(screen.queryByText("Track gain")).not.toBeInTheDocument();
    expect(screen.queryByText("Album gain")).not.toBeInTheDocument();
  });
});
