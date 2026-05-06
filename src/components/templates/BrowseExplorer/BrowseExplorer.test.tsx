import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { BrowseExplorer } from "./BrowseExplorer";
import type { BrowseExplorerProps } from "./types";

const mockInvoke = vi.mocked(invoke);
const mockOpen = vi.mocked(open);

const defaultProps: BrowseExplorerProps = {
  leftPath: null,
  rightPath: null,
  dualPane: false,
  layout: "horizontal",
  onLeftPathChange: vi.fn(),
  onRightPathChange: vi.fn(),
  onDualPaneChange: vi.fn(),
  onLayoutChange: vi.fn(),
};

const props = (overrides: Partial<BrowseExplorerProps> = {}): BrowseExplorerProps => ({
  ...defaultProps,
  onLeftPathChange: vi.fn(),
  onRightPathChange: vi.fn(),
  onDualPaneChange: vi.fn(),
  onLayoutChange: vi.fn(),
  ...overrides,
});

beforeEach(() => {
  mockInvoke.mockReset();
  mockOpen.mockReset();
  mockInvoke.mockImplementation(async (cmd) => {
    if (cmd === "list_directory") return [];
    return undefined;
  });
});

describe("BrowseExplorer", () => {
  // ── Empty state ───────────────────────────────────────────────

  it("shows folder picker prompt when no folder selected", () => {
    render(<BrowseExplorer {...props()} />);
    expect(screen.getByText("Choose a folder to explore its contents")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Browse" })).toBeInTheDocument();
  });

  it("does not show Split button in empty state", () => {
    render(<BrowseExplorer {...props()} />);
    expect(screen.queryByRole("button", { name: "Split" })).not.toBeInTheDocument();
  });

  // ── Single pane mode ──────────────────────────────────────────

  it("shows FileExplorer when leftPath is set", async () => {
    mockInvoke.mockImplementation(async (cmd) => {
      if (cmd === "list_directory") return [{ name: "Music", is_dir: true, size: 0, modified: 1700000000 }];
      return undefined;
    });

    render(<BrowseExplorer {...props({ leftPath: "/Volumes/IPOD" })} />);

    await waitFor(() => {
      expect(screen.getByText("Music")).toBeInTheDocument();
    });
  });

  it("shows the path in the folder picker", () => {
    render(<BrowseExplorer {...props({ leftPath: "/Volumes/IPOD" })} />);
    expect(screen.getByText("/Volumes/IPOD")).toBeInTheDocument();
  });

  it("shows Split button when leftPath is set", () => {
    render(<BrowseExplorer {...props({ leftPath: "/Volumes/IPOD" })} />);
    expect(screen.getByRole("button", { name: "Split" })).toBeInTheDocument();
  });

  it("does not show layout toggle in single pane mode", () => {
    render(<BrowseExplorer {...props({ leftPath: "/test" })} />);
    expect(screen.queryByTitle("Stack vertically")).not.toBeInTheDocument();
  });

  // ── Browsing folders ──────────────────────────────────────────

  it("calls onLeftPathChange when browsing for a folder", async () => {
    const onLeftPathChange = vi.fn();
    const user = userEvent.setup();
    mockOpen.mockResolvedValue("/Volumes/IPOD");

    render(<BrowseExplorer {...props({ onLeftPathChange })} />);
    await user.click(screen.getByRole("button", { name: "Browse" }));

    await waitFor(() => {
      expect(onLeftPathChange).toHaveBeenCalledWith("/Volumes/IPOD");
    });
  });

  it("does not call callback when dialog is cancelled", async () => {
    const onLeftPathChange = vi.fn();
    const user = userEvent.setup();
    mockOpen.mockResolvedValue(null);

    render(<BrowseExplorer {...props({ onLeftPathChange })} />);
    await user.click(screen.getByRole("button", { name: "Browse" }));

    await waitFor(() => {
      expect(mockOpen).toHaveBeenCalled();
    });
    expect(onLeftPathChange).not.toHaveBeenCalled();
  });

  it("calls onRightPathChange when browsing for right folder", async () => {
    const onRightPathChange = vi.fn();
    const user = userEvent.setup();
    mockOpen.mockResolvedValue("/other/folder");

    render(<BrowseExplorer {...props({ leftPath: "/test", dualPane: true, onRightPathChange })} />);

    // The second "Browse..." button in the right pane placeholder
    const browseBtn = screen.getByRole("button", { name: "Browse..." });
    await user.click(browseBtn);

    await waitFor(() => {
      expect(onRightPathChange).toHaveBeenCalledWith("/other/folder");
    });
  });

  // ── Dual pane mode ────────────────────────────────────────────

  it("calls onDualPaneChange when split is toggled", async () => {
    const onDualPaneChange = vi.fn();
    const user = userEvent.setup();

    render(<BrowseExplorer {...props({ leftPath: "/test", onDualPaneChange })} />);
    await user.click(screen.getByRole("button", { name: "Split" }));

    expect(onDualPaneChange).toHaveBeenCalledWith(true);
  });

  it("shows second pane prompt in dual pane mode without right path", () => {
    render(<BrowseExplorer {...props({ leftPath: "/test", dualPane: true })} />);
    expect(screen.getByText("Choose a folder for the second pane")).toBeInTheDocument();
  });

  it("renders two file explorers when both paths are set in dual mode", async () => {
    mockInvoke.mockImplementation(async (cmd) => {
      if (cmd === "list_directory") return [{ name: "file.txt", is_dir: false, size: 100, modified: 1700000000 }];
      return undefined;
    });

    render(<BrowseExplorer {...props({ leftPath: "/left", rightPath: "/right", dualPane: true })} />);

    // Both panes should have the file entry
    await waitFor(() => {
      const files = screen.getAllByText("file.txt");
      expect(files.length).toBe(2);
    });
  });

  it("shows layout toggle only in dual pane mode", () => {
    const { rerender } = render(<BrowseExplorer {...props({ leftPath: "/test" })} />);
    expect(screen.queryByTitle("Stack vertically")).not.toBeInTheDocument();

    rerender(<BrowseExplorer {...props({ leftPath: "/test", dualPane: true })} />);
    expect(screen.getByTitle("Stack vertically")).toBeInTheDocument();
  });

  it("calls onLayoutChange when layout button is clicked", async () => {
    const onLayoutChange = vi.fn();
    const user = userEvent.setup();

    render(<BrowseExplorer {...props({ leftPath: "/test", dualPane: true, onLayoutChange })} />);
    await user.click(screen.getByTitle("Stack vertically"));

    expect(onLayoutChange).toHaveBeenCalledWith("vertical");
  });

  it("shows Side by side title when layout is vertical", async () => {
    const onLayoutChange = vi.fn();
    const user = userEvent.setup();

    render(<BrowseExplorer {...props({ leftPath: "/test", dualPane: true, layout: "vertical", onLayoutChange })} />);

    const btn = screen.getByTitle("Side by side");
    expect(btn).toBeInTheDocument();
    await user.click(btn);

    expect(onLayoutChange).toHaveBeenCalledWith("horizontal");
  });

  it("calls onDualPaneChange(false) when Split toggled off", async () => {
    const onDualPaneChange = vi.fn();
    const user = userEvent.setup();

    render(<BrowseExplorer {...props({ leftPath: "/test", dualPane: true, onDualPaneChange })} />);
    await user.click(screen.getByRole("button", { name: "Split" }));

    expect(onDualPaneChange).toHaveBeenCalledWith(false);
  });
});
