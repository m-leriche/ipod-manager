import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { CheckPill } from "./CheckPill";

describe("CheckPill", () => {
  it("renders the label", () => {
    render(<CheckPill label="Tags" check={{ status: "pass", detail: null }} />);
    expect(screen.getByText(/Tags/)).toBeInTheDocument();
  });

  it("exposes the detail as a tooltip", () => {
    render(<CheckPill label="Tracklist" check={{ status: "fail", detail: "Missing track(s) 3" }} />);
    expect(screen.getByText(/Tracklist/)).toHaveAttribute("title", "Missing track(s) 3");
  });

  it("has no tooltip without detail", () => {
    render(<CheckPill label="Cover" check={{ status: "pending", detail: null }} />);
    expect(screen.getByText(/Cover/)).not.toHaveAttribute("title");
  });
});
