import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { ToolTabBar } from "./ToolTabBar";
import { TOOL_GROUPS } from "./constants";

describe("ToolTabBar", () => {
  it("renders every tool tab across all groups", () => {
    render(<ToolTabBar active="files" onSelect={vi.fn()} />);
    const allTabs = TOOL_GROUPS.flatMap((g) => g.tabs);
    for (const tab of allTabs) {
      expect(screen.getByRole("tab", { name: tab.label })).toBeInTheDocument();
    }
  });

  it("renders each group label", () => {
    render(<ToolTabBar active="files" onSelect={vi.fn()} />);
    for (const group of TOOL_GROUPS) {
      expect(screen.getByText(group.label)).toBeInTheDocument();
    }
  });

  it("marks the active tab as selected", () => {
    render(<ToolTabBar active="health" onSelect={vi.fn()} />);
    expect(screen.getByRole("tab", { name: "Health" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "iPod" })).toHaveAttribute("aria-selected", "false");
  });

  it("calls onSelect with the tab id when clicked", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<ToolTabBar active="files" onSelect={onSelect} />);
    await user.click(screen.getByRole("tab", { name: "Duplicates" }));
    expect(onSelect).toHaveBeenCalledWith("duplicates");
  });

  it("exposes each tab's description as a tooltip", () => {
    render(<ToolTabBar active="files" onSelect={vi.fn()} />);
    const ipod = TOOL_GROUPS[0].tabs.find((t) => t.id === "ipod");
    expect(screen.getByRole("tab", { name: "iPod" })).toHaveAttribute("title", ipod?.description);
  });
});
