import { render } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { RadialSpectrum } from "./RadialSpectrum";

describe("RadialSpectrum", () => {
  it("renders a canvas element", () => {
    const { container } = render(<RadialSpectrum size={60} />);
    const canvas = container.querySelector("canvas");
    expect(canvas).toBeInTheDocument();
  });

  it("renders children centered inside", () => {
    const { getByText } = render(
      <RadialSpectrum size={60}>
        <span>art</span>
      </RadialSpectrum>,
    );
    expect(getByText("art")).toBeInTheDocument();
  });

  it("applies size to container", () => {
    const { container } = render(<RadialSpectrum size={80} />);
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.style.width).toBe("80px");
    expect(wrapper.style.height).toBe("80px");
  });
});
