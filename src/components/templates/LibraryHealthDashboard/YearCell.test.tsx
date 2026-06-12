import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { YearCell } from "./YearCell";

describe("YearCell", () => {
  it("reports digit input to onChange", () => {
    const onChange = vi.fn();
    render(<YearCell value="" label="Year for Album A" onChange={onChange} />);

    fireEvent.change(screen.getByLabelText("Year for Album A"), { target: { value: "1994" } });

    expect(onChange).toHaveBeenCalledWith("1994");
  });

  it("strips non-digit input", () => {
    const onChange = vi.fn();
    render(<YearCell value="" label="Year for Album A" onChange={onChange} />);

    fireEvent.change(screen.getByLabelText("Year for Album A"), { target: { value: "19a9" } });

    expect(onChange).toHaveBeenCalledWith("199");
  });

  it("clears the draft on Escape", () => {
    const onChange = vi.fn();
    render(<YearCell value="1994" label="Year for Album A" onChange={onChange} />);

    fireEvent.keyDown(screen.getByLabelText("Year for Album A"), { key: "Escape" });

    expect(onChange).toHaveBeenCalledWith("");
  });

  it("renders the current draft value", () => {
    render(<YearCell value="2005" label="Year for Album A" onChange={() => {}} />);

    expect(screen.getByLabelText<HTMLInputElement>("Year for Album A").value).toBe("2005");
  });
});
