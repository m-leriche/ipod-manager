import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { FolderRow } from "./FolderRow";
import type { TreeNode } from "./types";

const node = (overrides: Partial<TreeNode> = {}): TreeNode => ({
  name: "Artist",
  path: "Artist",
  files: [],
  children: [],
  totalCounts: { source_only: 2, target_only: 0, modified: 0, same: 0 },
  totalFiles: 2,
  hasDifferences: true,
  dominant: "source_only",
  actionablePaths: ["Artist/a.mp3", "Artist/b.mp3"],
  ...overrides,
});

const baseProps = {
  depth: 0,
  isExpanded: false,
  allChecked: false,
  someChecked: false,
  onToggleExpand: vi.fn(),
  onToggleNodeSelection: vi.fn(),
  onContextMenu: vi.fn(),
};

describe("FolderRow", () => {
  it("renders folder name and summary badge", () => {
    render(<FolderRow {...baseProps} node={node()} />);
    expect(screen.getByText("Artist")).toBeInTheDocument();
    expect(screen.getByText("2 new")).toBeInTheDocument();
  });

  it("checkbox is checked when allChecked", () => {
    render(<FolderRow {...baseProps} node={node()} allChecked />);
    expect((screen.getByRole("checkbox") as HTMLInputElement).checked).toBe(true);
  });

  it("checkbox is indeterminate when someChecked but not all", () => {
    render(<FolderRow {...baseProps} node={node()} someChecked />);
    expect((screen.getByRole("checkbox") as HTMLInputElement).indeterminate).toBe(true);
  });

  it("toggles expansion on row click and selection on checkbox click", async () => {
    const onToggleExpand = vi.fn();
    const onToggleNodeSelection = vi.fn();
    render(
      <FolderRow
        {...baseProps}
        node={node()}
        onToggleExpand={onToggleExpand}
        onToggleNodeSelection={onToggleNodeSelection}
      />,
    );
    await userEvent.click(screen.getByText("Artist"));
    expect(onToggleExpand).toHaveBeenCalledWith("Artist");
    await userEvent.click(screen.getByRole("checkbox"));
    expect(onToggleNodeSelection).toHaveBeenCalled();
  });

  it("renders no checkbox when there is nothing actionable", () => {
    render(<FolderRow {...baseProps} node={node({ actionablePaths: [] })} />);
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });
});
