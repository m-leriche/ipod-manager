import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { CommandPalette } from "./CommandPalette";
import type { CommandPaletteProps } from "./types";

vi.mock("../../../contexts/ViewLayoutContext", () => ({
  useViewLayout: () => ({
    toggleColumnBrowser: vi.fn(),
    toggleAlbumGrid: vi.fn(),
    toggleArtworkCarousel: vi.fn(),
  }),
}));

const makeProps = (overrides: Partial<CommandPaletteProps> = {}): CommandPaletteProps => ({
  onClose: vi.fn(),
  onSelectTab: vi.fn(),
  onSelectTool: vi.fn(),
  onOpenSettings: vi.fn(),
  onRescan: vi.fn(),
  discoverEnabled: true,
  ...overrides,
});

describe("CommandPalette", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the search input focused with all actions grouped", () => {
    render(<CommandPalette {...makeProps()} />);

    expect(screen.getByLabelText("Search commands")).toHaveFocus();
    expect(screen.getByText("Navigate")).toBeInTheDocument();
    expect(screen.getByText("Tools")).toBeInTheDocument();
    expect(screen.getByText("Playback")).toBeInTheDocument();
    expect(screen.getByText("Go to Library")).toBeInTheDocument();
    expect(screen.getByText("Rescan Library")).toBeInTheDocument();
  });

  it("selects the first action by default", () => {
    render(<CommandPalette {...makeProps()} />);

    expect(screen.getByRole("option", { name: "Go to Library" })).toHaveAttribute("aria-selected", "true");
  });

  it("filters actions as the user types", () => {
    render(<CommandPalette {...makeProps()} />);

    fireEvent.change(screen.getByLabelText("Search commands"), { target: { value: "rescan" } });

    expect(screen.getByText("Rescan Library")).toBeInTheDocument();
    expect(screen.queryByText("Go to Inbox")).not.toBeInTheDocument();
  });

  it("shows an empty state when nothing matches", () => {
    render(<CommandPalette {...makeProps()} />);

    fireEvent.change(screen.getByLabelText("Search commands"), { target: { value: "zzzzzz" } });

    expect(screen.getByText("No matching commands")).toBeInTheDocument();
    expect(screen.queryAllByRole("option")).toHaveLength(0);
  });

  it("moves the selection with arrow keys", () => {
    render(<CommandPalette {...makeProps()} />);
    const input = screen.getByLabelText("Search commands");

    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(screen.getByRole("option", { name: "Go to Tools" })).toHaveAttribute("aria-selected", "true");

    fireEvent.keyDown(input, { key: "ArrowUp" });
    expect(screen.getByRole("option", { name: "Go to Library" })).toHaveAttribute("aria-selected", "true");
  });

  it("does not move the selection above the first action", () => {
    render(<CommandPalette {...makeProps()} />);
    const input = screen.getByLabelText("Search commands");

    fireEvent.keyDown(input, { key: "ArrowUp" });
    expect(screen.getByRole("option", { name: "Go to Library" })).toHaveAttribute("aria-selected", "true");
  });

  it("runs the selected action and closes on Enter", () => {
    const props = makeProps();
    render(<CommandPalette {...props} />);
    const input = screen.getByLabelText("Search commands");

    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(props.onSelectTab).toHaveBeenCalledWith("tools");
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it("runs the top-ranked action after filtering", () => {
    const props = makeProps();
    render(<CommandPalette {...props} />);
    const input = screen.getByLabelText("Search commands");

    fireEvent.change(input, { target: { value: "settings" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(props.onOpenSettings).toHaveBeenCalledTimes(1);
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it("runs an action on click", () => {
    const props = makeProps();
    render(<CommandPalette {...props} />);

    fireEvent.click(screen.getByRole("option", { name: "Open Duplicates" }));

    expect(props.onSelectTool).toHaveBeenCalledWith("duplicates");
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it("closes on Escape", () => {
    const props = makeProps();
    render(<CommandPalette {...props} />);

    fireEvent.keyDown(screen.getByLabelText("Search commands"), { key: "Escape" });

    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it("closes when the backdrop is clicked", () => {
    const props = makeProps();
    const { container } = render(<CommandPalette {...props} />);

    fireEvent.click(container.querySelector(".bg-black\\/50")!);

    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it("hides the Discover tab action when discover is disabled", () => {
    render(<CommandPalette {...makeProps({ discoverEnabled: false })} />);

    expect(screen.queryByText("Go to Discover")).not.toBeInTheDocument();
    expect(screen.getByText("Go to Inbox")).toBeInTheDocument();
  });
});
