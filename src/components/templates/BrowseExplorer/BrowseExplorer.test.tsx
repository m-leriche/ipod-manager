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
  mockInvoke.mockImplementation(async (cmd) => {
    if (cmd === "get_browse_profiles") return { profiles: [] };
    if (cmd === "save_browse_profiles") return undefined;
    if (cmd === "list_directory") return [];
    return undefined;
  });
});

describe("BrowseExplorer", () => {
  it("shows folder picker prompt when no folder selected", async () => {
    render(<BrowseExplorer />);
    expect(await screen.findByText("Choose a folder to explore its contents")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Browse" })).toBeInTheDocument();
  });

  it("shows FileExplorer after selecting a folder", async () => {
    const user = userEvent.setup();
    mockOpen.mockResolvedValue("/Volumes/IPOD");
    mockInvoke.mockImplementation(async (cmd) => {
      if (cmd === "get_browse_profiles") return { profiles: [] };
      if (cmd === "list_directory") return [{ name: "Music", is_dir: true, size: 0, modified: 1700000000 }];
      return undefined;
    });

    render(<BrowseExplorer />);
    await waitFor(() => screen.getByRole("button", { name: "Browse" }));
    await user.click(screen.getByRole("button", { name: "Browse" }));

    await waitFor(() => {
      expect(screen.getByText("Music")).toBeInTheDocument();
    });
  });

  it("shows the selected path in the folder picker", async () => {
    const user = userEvent.setup();
    mockOpen.mockResolvedValue("/Volumes/IPOD");

    render(<BrowseExplorer />);
    await waitFor(() => screen.getByRole("button", { name: "Browse" }));
    await user.click(screen.getByRole("button", { name: "Browse" }));

    await waitFor(() => {
      expect(screen.getByText("/Volumes/IPOD")).toBeInTheDocument();
    });
  });

  it("shows split pane toggle button after folder selected", async () => {
    const user = userEvent.setup();
    mockOpen.mockResolvedValue("/Volumes/IPOD");

    render(<BrowseExplorer />);
    await waitFor(() => screen.getByRole("button", { name: "Browse" }));
    await user.click(screen.getByRole("button", { name: "Browse" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Split" })).toBeInTheDocument();
    });
  });

  it("shows second pane when split is toggled on", async () => {
    const user = userEvent.setup();
    mockOpen.mockResolvedValue("/Volumes/IPOD");

    render(<BrowseExplorer />);
    await waitFor(() => screen.getByRole("button", { name: "Browse" }));
    await user.click(screen.getByRole("button", { name: "Browse" }));

    await waitFor(() => screen.getByRole("button", { name: "Split" }));
    await user.click(screen.getByRole("button", { name: "Split" }));

    await waitFor(() => {
      expect(screen.getByText("Choose a folder for the second pane")).toBeInTheDocument();
    });
  });

  it("returns to single pane when split is toggled off", async () => {
    const user = userEvent.setup();
    mockOpen.mockResolvedValue("/Volumes/IPOD");

    render(<BrowseExplorer />);
    await waitFor(() => screen.getByRole("button", { name: "Browse" }));
    await user.click(screen.getByRole("button", { name: "Browse" }));

    await waitFor(() => screen.getByRole("button", { name: "Split" }));
    await user.click(screen.getByRole("button", { name: "Split" }));
    await waitFor(() => screen.getByText("Choose a folder for the second pane"));

    await user.click(screen.getByRole("button", { name: "Split" }));
    await waitFor(() => {
      expect(screen.queryByText("Choose a folder for the second pane")).not.toBeInTheDocument();
    });
  });

  it("shows layout toggle only in dual pane mode", async () => {
    const user = userEvent.setup();
    mockOpen.mockResolvedValue("/Volumes/IPOD");

    render(<BrowseExplorer />);
    await waitFor(() => screen.getByRole("button", { name: "Browse" }));
    await user.click(screen.getByRole("button", { name: "Browse" }));

    await waitFor(() => screen.getByRole("button", { name: "Split" }));
    expect(screen.queryByTitle("Stack vertically")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Split" }));
    await waitFor(() => {
      expect(screen.getByTitle("Stack vertically")).toBeInTheDocument();
    });
  });

  it("shows profile selector", async () => {
    render(<BrowseExplorer />);
    await waitFor(() => {
      expect(screen.getByText("Profile")).toBeInTheDocument();
    });
  });

  it("loads saved profile state when switching to a profile", async () => {
    mockInvoke.mockImplementation(async (cmd) => {
      if (cmd === "get_browse_profiles")
        return {
          profiles: [
            { name: "My Setup", left_path: "/Users/test", right_path: null, dual_pane: false, layout: "horizontal" },
          ],
        };
      if (cmd === "list_directory") return [];
      return undefined;
    });

    const user = userEvent.setup();
    render(<BrowseExplorer />);

    // Select the profile from the dropdown
    const select = await screen.findByRole("combobox");
    await user.selectOptions(select, "My Setup");

    await waitFor(() => {
      expect(screen.getByText("/Users/test")).toBeInTheDocument();
    });
  });

  it("creates a new profile with reset state", async () => {
    const user = userEvent.setup();
    mockOpen.mockResolvedValue("/Volumes/IPOD");

    render(<BrowseExplorer />);

    // First pick a folder
    await waitFor(() => screen.getByRole("button", { name: "Browse" }));
    await user.click(screen.getByRole("button", { name: "Browse" }));
    await waitFor(() => screen.getByText("/Volumes/IPOD"));

    // Create a profile — should reset explorer state
    await user.click(screen.getByTitle("Create profile"));
    const input = screen.getByPlaceholderText("Profile name");
    await user.type(input, "Test");
    await user.click(screen.getByRole("button", { name: "Save" }));

    // Explorer should be reset to empty
    await waitFor(() => {
      expect(screen.getByText("Choose a folder to explore its contents")).toBeInTheDocument();
    });
  });
});
