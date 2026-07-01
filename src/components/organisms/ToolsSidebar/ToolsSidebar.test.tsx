import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { ToolsSidebar } from "./ToolsSidebar";
import { TOOL_GROUPS, ALL_TOOL_TABS } from "./constants";

describe("ToolsSidebar", () => {
  it("renders every group heading", () => {
    render(<ToolsSidebar active="files" onSelect={vi.fn()} />);
    for (const group of TOOL_GROUPS) {
      expect(screen.getByText(group.label)).toBeInTheDocument();
    }
  });

  it("renders every tool as a tab, all visible at once", () => {
    render(<ToolsSidebar active="files" onSelect={vi.fn()} />);
    for (const tab of ALL_TOOL_TABS) {
      expect(screen.getByRole("tab", { name: tab.label })).toBeInTheDocument();
    }
  });

  it("marks the active tool as selected", () => {
    render(<ToolsSidebar active="health" onSelect={vi.fn()} />);
    expect(screen.getByRole("tab", { name: "Health" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "iPod" })).toHaveAttribute("aria-selected", "false");
  });

  it("calls onSelect with the tool id when clicked", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<ToolsSidebar active="files" onSelect={onSelect} />);
    await user.click(screen.getByRole("tab", { name: "Duplicates" }));
    expect(onSelect).toHaveBeenCalledWith("duplicates");
  });
});
