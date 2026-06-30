import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { SplitFolderRow } from "./SplitFolderRow";
import type { TreeNode } from "../ComparisonView/types";

const node = (overrides: Partial<TreeNode> = {}): TreeNode => ({
  name: "Artist",
  path: "Artist",
  files: [],
  children: [],
  totalCounts: { source_only: 2, target_only: 1, modified: 0, same: 0 },
  totalFiles: 3,
  hasDifferences: true,
  dominant: "mixed",
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

describe("SplitFolderRow", () => {
  it("renders the folder name on both panes", () => {
    render(<SplitFolderRow {...baseProps} node={node()} />);
    expect(screen.getAllByText("Artist")).toHaveLength(2);
  });

  it("shows source badges on the left and target badges on the right", () => {
    render(<SplitFolderRow {...baseProps} node={node()} />);
    expect(screen.getByText("2 new")).toBeInTheDocument(); // source side
    expect(screen.getByText("1 extra")).toBeInTheDocument(); // target side
  });

  it("checkbox indeterminate when partially selected", () => {
    render(<SplitFolderRow {...baseProps} node={node()} someChecked />);
    expect((screen.getByRole("checkbox") as HTMLInputElement).indeterminate).toBe(true);
  });

  it("toggles expansion and node selection", async () => {
    const onToggleExpand = vi.fn();
    const onToggleNodeSelection = vi.fn();
    render(
      <SplitFolderRow
        {...baseProps}
        node={node()}
        onToggleExpand={onToggleExpand}
        onToggleNodeSelection={onToggleNodeSelection}
      />,
    );
    await userEvent.click(screen.getAllByText("Artist")[0]);
    expect(onToggleExpand).toHaveBeenCalledWith("Artist");
    await userEvent.click(screen.getByRole("checkbox"));
    expect(onToggleNodeSelection).toHaveBeenCalled();
  });
});
