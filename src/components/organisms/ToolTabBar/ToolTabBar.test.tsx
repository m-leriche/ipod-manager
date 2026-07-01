import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { ToolTabBar } from "./ToolTabBar";
import { TOOL_GROUPS } from "./constants";

const [fileSync, libraryQuality, audioTools] = TOOL_GROUPS;

describe("ToolTabBar", () => {
  it("renders every category as a tab", () => {
    render(<ToolTabBar active="files" onSelect={vi.fn()} />);
    for (const group of TOOL_GROUPS) {
      expect(screen.getByRole("tab", { name: group.label })).toBeInTheDocument();
    }
  });

  it("shows only the active category's sub-tools", () => {
    render(<ToolTabBar active="files" onSelect={vi.fn()} />);
    // File & Sync tools are visible
    for (const tab of fileSync.tabs) {
      expect(screen.getByRole("tab", { name: tab.label })).toBeInTheDocument();
    }
    // Other categories' tools are hidden
    for (const tab of [...libraryQuality.tabs, ...audioTools.tabs]) {
      expect(screen.queryByRole("tab", { name: tab.label })).not.toBeInTheDocument();
    }
  });

  it("marks the category containing the active tool as selected", () => {
    render(<ToolTabBar active="health" onSelect={vi.fn()} />);
    expect(screen.getByRole("tab", { name: libraryQuality.label })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: fileSync.label })).toHaveAttribute("aria-selected", "false");
  });

  it("reveals a category's tools when its category tab is clicked", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<ToolTabBar active="files" onSelect={onSelect} />);
    await user.click(screen.getByRole("tab", { name: audioTools.label }));
    // Selecting a category jumps to its first tool
    expect(onSelect).toHaveBeenCalledWith(audioTools.tabs[0].id);
  });

  it("shows the sub-tools for whichever category owns the active tool", () => {
    render(<ToolTabBar active="convert" onSelect={vi.fn()} />);
    for (const tab of audioTools.tabs) {
      expect(screen.getByRole("tab", { name: tab.label })).toBeInTheDocument();
    }
    expect(screen.queryByRole("tab", { name: "iPod" })).not.toBeInTheDocument();
  });

  it("marks the active sub-tool as selected", () => {
    render(<ToolTabBar active="duplicates" onSelect={vi.fn()} />);
    expect(screen.getByRole("tab", { name: "Duplicates" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Health" })).toHaveAttribute("aria-selected", "false");
  });

  it("calls onSelect with the tool id when a sub-tool is clicked", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<ToolTabBar active="health" onSelect={onSelect} />);
    await user.click(screen.getByRole("tab", { name: "Metadata" }));
    expect(onSelect).toHaveBeenCalledWith("metadata");
  });

  it("exposes each sub-tool's description as a tooltip", () => {
    render(<ToolTabBar active="files" onSelect={vi.fn()} />);
    const ipod = fileSync.tabs.find((t) => t.id === "ipod");
    expect(screen.getByRole("tab", { name: "iPod" })).toHaveAttribute("title", ipod?.description);
  });
});
