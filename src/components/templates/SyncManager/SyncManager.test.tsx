import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { SyncManager } from "./SyncManager";
import type { SyncManagerProps } from "./types";

const mockInvoke = vi.mocked(invoke);
const mockOpen = vi.mocked(open);

const defaultProps: SyncManagerProps = {
  sourcePath: null,
  targetPath: null,
  exclusions: [],
  onSourcePathChange: vi.fn(),
  onTargetPathChange: vi.fn(),
  onExclusionsChange: vi.fn(),
};

const props = (overrides: Partial<SyncManagerProps> = {}): SyncManagerProps => ({
  ...defaultProps,
  onSourcePathChange: vi.fn(),
  onTargetPathChange: vi.fn(),
  onExclusionsChange: vi.fn(),
  ...overrides,
});

beforeEach(() => {
  mockInvoke.mockReset();
  mockOpen.mockReset();
  mockInvoke.mockImplementation(async () => []);
});

describe("SyncManager", () => {
  // ── Folder setup view ─────────────────────────────────────────

  it("shows Source and Target folder pickers", () => {
    render(<SyncManager {...props()} />);
    expect(screen.getByText("Source")).toBeInTheDocument();
    expect(screen.getByText("Target")).toBeInTheDocument();
  });

  it("shows both paths when provided", () => {
    render(<SyncManager {...props({ sourcePath: "/music", targetPath: "/ipod" })} />);
    expect(screen.getByText("/music")).toBeInTheDocument();
    expect(screen.getByText("/ipod")).toBeInTheDocument();
  });

  it("disables Compare button when paths are missing", () => {
    render(<SyncManager {...props()} />);
    expect(screen.getByRole("button", { name: "Compare Folders" })).toBeDisabled();
  });

  it("disables Compare button when only source is set", () => {
    render(<SyncManager {...props({ sourcePath: "/src" })} />);
    expect(screen.getByRole("button", { name: "Compare Folders" })).toBeDisabled();
  });

  it("disables Compare button when only target is set", () => {
    render(<SyncManager {...props({ targetPath: "/tgt" })} />);
    expect(screen.getByRole("button", { name: "Compare Folders" })).toBeDisabled();
  });

  it("enables Compare button when both paths are set", () => {
    render(<SyncManager {...props({ sourcePath: "/src", targetPath: "/tgt" })} />);
    expect(screen.getByRole("button", { name: "Compare Folders" })).toBeEnabled();
  });

  // ── Browse folder interactions ────────────────────────────────

  it("calls onSourcePathChange when browsing source", async () => {
    const onSourcePathChange = vi.fn();
    const user = userEvent.setup();
    mockOpen.mockResolvedValue("/new-source");

    render(<SyncManager {...props({ sourcePath: "/src", targetPath: "/tgt", onSourcePathChange })} />);

    const browseButtons = screen.getAllByRole("button", { name: "Browse" });
    await user.click(browseButtons[0]);

    await waitFor(() => {
      expect(onSourcePathChange).toHaveBeenCalledWith("/new-source");
    });
  });

  it("calls onTargetPathChange when browsing target", async () => {
    const onTargetPathChange = vi.fn();
    const user = userEvent.setup();
    mockOpen.mockResolvedValue("/new-target");

    render(<SyncManager {...props({ sourcePath: "/src", targetPath: "/tgt", onTargetPathChange })} />);

    const browseButtons = screen.getAllByRole("button", { name: "Browse" });
    await user.click(browseButtons[1]);

    await waitFor(() => {
      expect(onTargetPathChange).toHaveBeenCalledWith("/new-target");
    });
  });

  it("does not call callback when dialog is cancelled", async () => {
    const onSourcePathChange = vi.fn();
    const user = userEvent.setup();
    mockOpen.mockResolvedValue(null);

    render(<SyncManager {...props({ onSourcePathChange })} />);

    const browseButtons = screen.getAllByRole("button", { name: "Browse" });
    await user.click(browseButtons[0]);

    await waitFor(() => expect(mockOpen).toHaveBeenCalled());
    expect(onSourcePathChange).not.toHaveBeenCalled();
  });

  // ── Compare transition ────────────────────────────────────────

  it("transitions to comparison view when Compare is clicked", async () => {
    const user = userEvent.setup();
    mockInvoke.mockImplementation(async (cmd) => {
      if (cmd === "compare_directories") return [];
      return undefined;
    });

    render(<SyncManager {...props({ sourcePath: "/src", targetPath: "/tgt" })} />);

    await user.click(screen.getByRole("button", { name: "Compare Folders" }));

    // Should show Tree/Split view mode toggle
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Tree" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Split" })).toBeInTheDocument();
    });

    // Folder pickers and Compare button should be gone
    expect(screen.queryByRole("button", { name: "Compare Folders" })).not.toBeInTheDocument();
  });

  it("defaults to Split view mode", async () => {
    const user = userEvent.setup();
    mockInvoke.mockImplementation(async () => []);

    render(<SyncManager {...props({ sourcePath: "/src", targetPath: "/tgt" })} />);
    await user.click(screen.getByRole("button", { name: "Compare Folders" }));

    await waitFor(() => {
      const splitBtn = screen.getByRole("button", { name: "Split" });
      // Split button should be the "active" one (has border-border-active class)
      expect(splitBtn.className).toContain("border-border-active");
    });
  });

  it("switches between Tree and Split view modes", async () => {
    const user = userEvent.setup();
    mockInvoke.mockImplementation(async () => []);

    render(<SyncManager {...props({ sourcePath: "/src", targetPath: "/tgt" })} />);
    await user.click(screen.getByRole("button", { name: "Compare Folders" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Tree" })).toBeInTheDocument());

    // Click Tree
    await user.click(screen.getByRole("button", { name: "Tree" }));
    await waitFor(() => {
      const treeBtn = screen.getByRole("button", { name: "Tree" });
      expect(treeBtn.className).toContain("border-border-active");
    });

    // Click Split
    await user.click(screen.getByRole("button", { name: "Split" }));
    await waitFor(() => {
      const splitBtn = screen.getByRole("button", { name: "Split" });
      expect(splitBtn.className).toContain("border-border-active");
    });
  });
});
