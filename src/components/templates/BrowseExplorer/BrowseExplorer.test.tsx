import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { BrowseExplorer } from "./BrowseExplorer";

const mockInvoke = vi.mocked(invoke);
const mockOpen = vi.mocked(open);

beforeEach(() => {
  mockInvoke.mockReset();
  mockOpen.mockReset();
});

describe("BrowseExplorer", () => {
  it("shows folder picker prompt when no folder selected", () => {
    render(<BrowseExplorer />);
    expect(screen.getByText("Choose a folder to explore its contents")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Browse" })).toBeInTheDocument();
  });

  it("shows FileExplorer after selecting a folder", async () => {
    const user = userEvent.setup();
    mockOpen.mockResolvedValue("/Volumes/IPOD");
    mockInvoke.mockResolvedValue([{ name: "Music", is_dir: true, size: 0, modified: 1700000000 }]);

    render(<BrowseExplorer />);
    await user.click(screen.getByRole("button", { name: "Browse" }));

    await waitFor(() => {
      expect(screen.getByText("Music")).toBeInTheDocument();
    });
  });

  it("shows the selected path in the folder picker", async () => {
    const user = userEvent.setup();
    mockOpen.mockResolvedValue("/Volumes/IPOD");
    mockInvoke.mockResolvedValue([]);

    render(<BrowseExplorer />);
    await user.click(screen.getByRole("button", { name: "Browse" }));

    await waitFor(() => {
      expect(screen.getByText("/Volumes/IPOD")).toBeInTheDocument();
    });
  });

  it("shows split pane toggle button after folder selected", async () => {
    const user = userEvent.setup();
    mockOpen.mockResolvedValue("/Volumes/IPOD");
    mockInvoke.mockResolvedValue([]);

    render(<BrowseExplorer />);
    await user.click(screen.getByRole("button", { name: "Browse" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Split" })).toBeInTheDocument();
    });
  });

  it("shows second pane when split is toggled on", async () => {
    const user = userEvent.setup();
    mockOpen.mockResolvedValue("/Volumes/IPOD");
    mockInvoke.mockResolvedValue([]);

    render(<BrowseExplorer />);
    await user.click(screen.getByRole("button", { name: "Browse" }));

    await waitFor(() => screen.getByRole("button", { name: "Split" }));
    await user.click(screen.getByRole("button", { name: "Split" }));

    // Second pane should prompt for folder
    await waitFor(() => {
      expect(screen.getByText("Choose a folder for the second pane")).toBeInTheDocument();
    });
  });

  it("returns to single pane when split is toggled off", async () => {
    const user = userEvent.setup();
    mockOpen.mockResolvedValue("/Volumes/IPOD");
    mockInvoke.mockResolvedValue([]);

    render(<BrowseExplorer />);
    await user.click(screen.getByRole("button", { name: "Browse" }));

    await waitFor(() => screen.getByRole("button", { name: "Split" }));
    // Toggle on
    await user.click(screen.getByRole("button", { name: "Split" }));
    await waitFor(() => screen.getByText("Choose a folder for the second pane"));
    // Toggle off
    await user.click(screen.getByRole("button", { name: "Split" }));
    await waitFor(() => {
      expect(screen.queryByText("Choose a folder for the second pane")).not.toBeInTheDocument();
    });
  });

  it("shows layout toggle only in dual pane mode", async () => {
    const user = userEvent.setup();
    mockOpen.mockResolvedValue("/Volumes/IPOD");
    mockInvoke.mockResolvedValue([]);

    render(<BrowseExplorer />);
    await user.click(screen.getByRole("button", { name: "Browse" }));

    await waitFor(() => screen.getByRole("button", { name: "Split" }));
    // Layout button should not exist yet
    expect(screen.queryByTitle("Stack vertically")).not.toBeInTheDocument();

    // Toggle split on
    await user.click(screen.getByRole("button", { name: "Split" }));
    await waitFor(() => {
      expect(screen.getByTitle("Stack vertically")).toBeInTheDocument();
    });
  });
});
