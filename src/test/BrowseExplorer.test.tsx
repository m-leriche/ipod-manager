import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { BrowseExplorer } from "../components/organisms/BrowseExplorer";

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
    mockInvoke.mockResolvedValue([
      { name: "Music", is_dir: true, size: 0, modified: 1700000000 },
    ]);

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
});
