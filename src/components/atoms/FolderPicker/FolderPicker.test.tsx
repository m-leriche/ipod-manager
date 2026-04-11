import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { FolderPicker } from "./FolderPicker";

describe("FolderPicker", () => {
  it("renders label and Browse button", () => {
    render(<FolderPicker label="Source" path={null} onBrowse={vi.fn()} />);
    expect(screen.getByText("Source")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Browse" })).toBeInTheDocument();
  });

  it("shows placeholder when no path", () => {
    render(<FolderPicker label="Source" path={null} onBrowse={vi.fn()} />);
    expect(screen.getByText("No folder selected")).toBeInTheDocument();
  });

  it("shows path when set", () => {
    render(<FolderPicker label="Source" path="/Volumes/Music" onBrowse={vi.fn()} />);
    expect(screen.getByText("/Volumes/Music")).toBeInTheDocument();
  });

  it("calls onBrowse when Browse is clicked", async () => {
    const user = userEvent.setup();
    const onBrowse = vi.fn();
    render(<FolderPicker label="Source" path={null} onBrowse={onBrowse} />);
    await user.click(screen.getByRole("button", { name: "Browse" }));
    expect(onBrowse).toHaveBeenCalled();
  });

  it("disables Browse button when disabled", () => {
    render(<FolderPicker label="Source" path={null} onBrowse={vi.fn()} disabled />);
    expect(screen.getByRole("button", { name: "Browse" })).toBeDisabled();
  });
});
