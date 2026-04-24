import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { Pill } from "./Pill";

describe("Pill", () => {
  it("renders children", () => {
    render(<Pill onClick={vi.fn()}>Test Label</Pill>);
    expect(screen.getByText("Test Label")).toBeInTheDocument();
  });

  it("calls onClick when clicked", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<Pill onClick={onClick}>Click Me</Pill>);
    await user.click(screen.getByText("Click Me"));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("renders as a button", () => {
    render(<Pill onClick={vi.fn()}>Button</Pill>);
    expect(screen.getByRole("button", { name: "Button" })).toBeInTheDocument();
  });
});
