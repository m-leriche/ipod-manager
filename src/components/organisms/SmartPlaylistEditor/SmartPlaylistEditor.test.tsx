import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { SmartPlaylistEditor } from "./SmartPlaylistEditor";

const defaultProps = {
  onSave: vi.fn(),
  onCancel: vi.fn(),
};

describe("SmartPlaylistEditor", () => {
  it("renders with 'New Smart Playlist' title when no initialName", () => {
    render(<SmartPlaylistEditor {...defaultProps} />);
    expect(screen.getByText("New Smart Playlist")).toBeInTheDocument();
  });

  it("renders with 'Edit Smart Playlist' title when initialName provided", () => {
    render(<SmartPlaylistEditor {...defaultProps} initialName="My Playlist" />);
    expect(screen.getByText("Edit Smart Playlist")).toBeInTheDocument();
  });

  it("populates name input with initialName", () => {
    render(<SmartPlaylistEditor {...defaultProps} initialName="Rock Hits" />);
    expect(screen.getByDisplayValue("Rock Hits")).toBeInTheDocument();
  });

  it("disables Save when name is empty", () => {
    render(<SmartPlaylistEditor {...defaultProps} />);
    const saveButton = screen.getByText("Save");
    expect(saveButton).toBeDisabled();
  });

  it("enables Save when name is filled", async () => {
    render(<SmartPlaylistEditor {...defaultProps} />);
    await userEvent.type(screen.getByPlaceholderText("Playlist name..."), "My Playlist");
    expect(screen.getByText("Save")).not.toBeDisabled();
  });

  it("calls onCancel when Cancel is clicked", async () => {
    const onCancel = vi.fn();
    render(<SmartPlaylistEditor {...defaultProps} onCancel={onCancel} />);
    await userEvent.click(screen.getByText("Cancel"));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("calls onCancel when backdrop is clicked", async () => {
    const onCancel = vi.fn();
    const { container } = render(<SmartPlaylistEditor {...defaultProps} onCancel={onCancel} />);
    const backdrop = container.querySelector(".bg-black\\/50");
    await userEvent.click(backdrop!);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("adds a new rule when '+ Add Rule' is clicked", async () => {
    render(<SmartPlaylistEditor {...defaultProps} />);
    // Initially 1 rule
    const removeButtons = screen.getAllByRole("button").filter((b) => b.querySelector("svg"));
    const initialRemoveCount = removeButtons.length;

    await userEvent.click(screen.getByText("+ Add Rule"));

    const afterRemoveButtons = screen.getAllByRole("button").filter((b) => b.querySelector("svg"));
    expect(afterRemoveButtons.length).toBeGreaterThan(initialRemoveCount);
  });

  it("does not save when rules have empty values", async () => {
    const onSave = vi.fn();
    render(<SmartPlaylistEditor {...defaultProps} onSave={onSave} />);
    await userEvent.type(screen.getByPlaceholderText("Playlist name..."), "My Playlist");
    // Default rule has empty value — save should be a no-op
    await userEvent.click(screen.getByText("Save"));
    expect(onSave).not.toHaveBeenCalled();
  });

  it("calls onSave with correct data when form is valid", async () => {
    const onSave = vi.fn();
    render(<SmartPlaylistEditor {...defaultProps} onSave={onSave} />);

    await userEvent.type(screen.getByPlaceholderText("Playlist name..."), "Rock Hits");
    await userEvent.type(screen.getByPlaceholderText("value"), "Rock");
    await userEvent.click(screen.getByText("Save"));

    expect(onSave).toHaveBeenCalledTimes(1);
    const [name, rules] = onSave.mock.calls[0];
    expect(name).toBe("Rock Hits");
    expect(rules.match).toBe("all");
    expect(rules.rules).toHaveLength(1);
    expect(rules.rules[0].value).toBe("Rock");
  });

  it("shows match type selector", () => {
    render(<SmartPlaylistEditor {...defaultProps} />);
    expect(screen.getByText("Match")).toBeInTheDocument();
    expect(screen.getByText("of the following rules:")).toBeInTheDocument();
  });

  it("shows sort and limit options", () => {
    render(<SmartPlaylistEditor {...defaultProps} />);
    expect(screen.getByText("Sort by")).toBeInTheDocument();
    expect(screen.getByText("Limit to")).toBeInTheDocument();
  });

  it("preserves initialRules when provided", () => {
    const initialRules = {
      match: "any" as const,
      rules: [{ field: "genre", operator: "equals", value: "Bebop" }],
    };
    render(<SmartPlaylistEditor {...defaultProps} initialName="Jazz Vibes" initialRules={initialRules} />);
    expect(screen.getByDisplayValue("Jazz Vibes")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Bebop")).toBeInTheDocument();
  });
});
