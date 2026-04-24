import { render } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { Spinner } from "./Spinner";

describe("Spinner", () => {
  it("renders a spinning element", () => {
    const { container } = render(<Spinner />);
    const spinner = container.querySelector("span");
    expect(spinner).toBeInTheDocument();
    expect(spinner?.className).toContain("animate-spin");
  });

  it("is inline-block", () => {
    const { container } = render(<Spinner />);
    const spinner = container.querySelector("span");
    expect(spinner?.className).toContain("inline-block");
  });
});
