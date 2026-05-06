import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { FileManager } from "./FileManager";
import type { FileManagerProfileStore } from "../../../types/profiles";

const mockInvoke = vi.mocked(invoke);

const EMPTY_STORE: FileManagerProfileStore = { profiles: [] };

const STORE_WITH_BROWSE: FileManagerProfileStore = {
  profiles: [
    {
      name: "Browse Test",
      mode: "browse",
      left_path: "/Users/test",
      right_path: null,
      dual_pane: false,
      layout: "horizontal",
      exclusions: [],
    },
  ],
  active_profile: "Browse Test",
};

const STORE_WITH_SYNC: FileManagerProfileStore = {
  profiles: [
    {
      name: "Sync Test",
      mode: "sync",
      left_path: "/src",
      right_path: "/tgt",
      dual_pane: false,
      layout: "horizontal",
      exclusions: [],
    },
  ],
  active_profile: "Sync Test",
};

const STORE_WITH_SYNC_EXCLUSIONS: FileManagerProfileStore = {
  profiles: [
    {
      name: "Sync Filtered",
      mode: "sync",
      left_path: "/src",
      right_path: "/tgt",
      dual_pane: false,
      layout: "horizontal",
      exclusions: ["node_modules", ".git"],
    },
  ],
  active_profile: "Sync Filtered",
};

const STORE_WITH_MULTIPLE: FileManagerProfileStore = {
  profiles: [
    {
      name: "Browse One",
      mode: "browse",
      left_path: "/folder-a",
      right_path: null,
      dual_pane: false,
      layout: "horizontal",
      exclusions: [],
    },
    {
      name: "Sync Two",
      mode: "sync",
      left_path: "/source",
      right_path: "/target",
      dual_pane: false,
      layout: "horizontal",
      exclusions: ["logs"],
    },
  ],
  active_profile: "Browse One",
};

const mockStore = (store: FileManagerProfileStore) => {
  mockInvoke.mockImplementation(async (cmd: string) => {
    if (cmd === "get_file_manager_profiles") return store;
    if (cmd === "save_file_manager_profiles") return undefined;
    if (cmd === "list_directory") return [];
    return undefined;
  });
};

beforeEach(() => {
  mockInvoke.mockReset();
  mockStore(EMPTY_STORE);
});

describe("FileManager", () => {
  // ── Rendering ─────────────────────────────────────────────────

  it("renders profile bar and mode toggle", async () => {
    render(<FileManager />);
    await waitFor(() => expect(screen.getByText("Profile")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Browse" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sync" })).toBeInTheDocument();
  });

  it("shows empty state when no profile is selected", async () => {
    render(<FileManager />);
    await waitFor(() => {
      expect(screen.getByText("Select or create a profile to get started")).toBeInTheDocument();
    });
  });

  it("loads profiles from backend on mount", async () => {
    render(<FileManager />);
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith("get_file_manager_profiles");
    });
  });

  // ── Mode auto-selection ───────────────────────────────────────

  it("defaults to Browse mode for browse profiles", async () => {
    mockStore(STORE_WITH_BROWSE);
    render(<FileManager />);
    await waitFor(() => {
      expect(screen.getByText("/Users/test")).toBeInTheDocument();
    });
    // Should NOT show sync UI
    expect(screen.queryByText("Source")).not.toBeInTheDocument();
  });

  it("auto-selects sync mode for sync profiles", async () => {
    mockStore(STORE_WITH_SYNC);
    render(<FileManager />);
    await waitFor(() => {
      expect(screen.getByText("Source")).toBeInTheDocument();
      expect(screen.getByText("Target")).toBeInTheDocument();
    });
  });

  // ── Mode switching ────────────────────────────────────────────

  it("switches from Browse to Sync mode", async () => {
    const user = userEvent.setup();
    mockStore(STORE_WITH_BROWSE);
    render(<FileManager />);

    await waitFor(() => expect(screen.getByText("/Users/test")).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: "Sync" }));

    await waitFor(() => {
      expect(screen.getByText("Source")).toBeInTheDocument();
      expect(screen.getByText("Target")).toBeInTheDocument();
    });
  });

  it("switches from Sync to Browse mode", async () => {
    const user = userEvent.setup();
    mockStore(STORE_WITH_SYNC);
    render(<FileManager />);

    await waitFor(() => expect(screen.getByText("Source")).toBeInTheDocument());

    // The mode toggle "Browse" is the first button with that name
    const browseButtons = screen.getAllByRole("button", { name: "Browse" });
    await user.click(browseButtons[0]);

    await waitFor(() => {
      // Sync's left_path (/src) should now show in browse mode
      expect(screen.getByText("/src")).toBeInTheDocument();
      expect(screen.queryByText("Source")).not.toBeInTheDocument();
    });
  });

  it("paths carry over when switching modes", async () => {
    const user = userEvent.setup();
    mockStore(STORE_WITH_SYNC);
    render(<FileManager />);

    // Wait for Sync mode to render
    await waitFor(() => expect(screen.getByText("/src")).toBeInTheDocument());
    expect(screen.getByText("/tgt")).toBeInTheDocument();

    // Switch to Browse — the same paths should still be visible
    const browseButtons = screen.getAllByRole("button", { name: "Browse" });
    await user.click(browseButtons[0]);

    await waitFor(() => {
      expect(screen.getByText("/src")).toBeInTheDocument();
    });
  });

  // ── Profile CRUD ──────────────────────────────────────────────

  it("creates a new profile in current mode", async () => {
    const user = userEvent.setup();
    render(<FileManager />);
    await waitFor(() => expect(mockInvoke).toHaveBeenCalledWith("get_file_manager_profiles"));

    await user.click(screen.getByTitle("Create profile"));
    await user.type(screen.getByPlaceholderText("Profile name"), "MyProfile");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith(
        "save_file_manager_profiles",
        expect.objectContaining({
          store: expect.objectContaining({
            profiles: [expect.objectContaining({ name: "MyProfile", mode: "browse" })],
            active_profile: "MyProfile",
          }),
        }),
      );
    });
  });

  it("creates a sync profile when in sync mode", async () => {
    const user = userEvent.setup();
    mockStore(STORE_WITH_BROWSE);
    render(<FileManager />);

    await waitFor(() => expect(screen.getByText("/Users/test")).toBeInTheDocument());

    // Switch to sync mode first
    await user.click(screen.getByRole("button", { name: "Sync" }));
    await waitFor(() => expect(screen.getByText("Source")).toBeInTheDocument());

    // Now create a profile — it should inherit sync mode
    await user.click(screen.getByTitle("Create profile"));
    await user.type(screen.getByPlaceholderText("Profile name"), "New Sync");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith(
        "save_file_manager_profiles",
        expect.objectContaining({
          store: expect.objectContaining({
            profiles: expect.arrayContaining([expect.objectContaining({ name: "New Sync", mode: "sync" })]),
          }),
        }),
      );
    });
  });

  it("deletes the active profile and resets to empty state", async () => {
    const user = userEvent.setup();
    mockStore(STORE_WITH_BROWSE);
    render(<FileManager />);

    await waitFor(() => expect(screen.getByText("/Users/test")).toBeInTheDocument());

    await user.click(screen.getByTitle("Delete profile"));
    // Confirm deletion
    await waitFor(() => expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith(
        "save_file_manager_profiles",
        expect.objectContaining({
          store: expect.objectContaining({ profiles: [] }),
        }),
      );
    });

    // Should show empty state
    await waitFor(() => {
      expect(screen.getByText("Select or create a profile to get started")).toBeInTheDocument();
    });
  });

  it("renames the active profile", async () => {
    const user = userEvent.setup();
    mockStore(STORE_WITH_BROWSE);
    render(<FileManager />);

    await waitFor(() => expect(screen.getByText("/Users/test")).toBeInTheDocument());

    await user.click(screen.getByTitle("Rename profile"));
    const input = screen.getByPlaceholderText("Profile name");
    await user.clear(input);
    await user.type(input, "Renamed");
    await user.click(screen.getByRole("button", { name: "Rename" }));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith(
        "save_file_manager_profiles",
        expect.objectContaining({
          store: expect.objectContaining({
            profiles: [expect.objectContaining({ name: "Renamed" })],
            active_profile: "Renamed",
          }),
        }),
      );
    });
  });

  it("duplicates a profile", async () => {
    const user = userEvent.setup();
    mockStore(STORE_WITH_BROWSE);
    render(<FileManager />);

    await waitFor(() => expect(screen.getByText("/Users/test")).toBeInTheDocument());

    await user.click(screen.getByTitle("Duplicate profile"));
    const input = screen.getByDisplayValue("Browse Test (copy)");
    await user.clear(input);
    await user.type(input, "Cloned");
    await user.click(screen.getByRole("button", { name: "Duplicate" }));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith(
        "save_file_manager_profiles",
        expect.objectContaining({
          store: expect.objectContaining({
            profiles: expect.arrayContaining([
              expect.objectContaining({ name: "Browse Test" }),
              expect.objectContaining({ name: "Cloned", left_path: "/Users/test" }),
            ]),
            active_profile: "Cloned",
          }),
        }),
      );
    });
  });

  // ── Profile switching ─────────────────────────────────────────

  it("switches between profiles and auto-changes mode", async () => {
    const user = userEvent.setup();
    mockStore(STORE_WITH_MULTIPLE);
    render(<FileManager />);

    // Starts on Browse One
    await waitFor(() => expect(screen.getByText("/folder-a")).toBeInTheDocument());

    // Switch to Sync Two via the dropdown
    const select = screen.getByRole("combobox");
    await user.selectOptions(select, "Sync Two");

    // Should auto-switch to sync mode and show its paths
    await waitFor(() => {
      expect(screen.getByText("Source")).toBeInTheDocument();
      expect(screen.getByText("/source")).toBeInTheDocument();
      expect(screen.getByText("/target")).toBeInTheDocument();
    });
  });

  it("deselects profile and shows empty state", async () => {
    const user = userEvent.setup();
    mockStore(STORE_WITH_BROWSE);
    render(<FileManager />);

    await waitFor(() => expect(screen.getByText("/Users/test")).toBeInTheDocument());

    // Select "None" option
    const select = screen.getByRole("combobox");
    await user.selectOptions(select, "");

    await waitFor(() => {
      expect(screen.getByText("Select or create a profile to get started")).toBeInTheDocument();
    });
  });

  // ── Dirty tracking ────────────────────────────────────────────

  it("shows save/discard when profile is modified", async () => {
    const user = userEvent.setup();
    mockStore(STORE_WITH_BROWSE);
    render(<FileManager />);

    await waitFor(() => expect(screen.getByText("/Users/test")).toBeInTheDocument());

    // Mode change makes it dirty
    await user.click(screen.getByRole("button", { name: "Sync" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Save profile" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Discard" })).toBeInTheDocument();
    });
  });

  it("discard restores saved profile state and mode", async () => {
    const user = userEvent.setup();
    mockStore(STORE_WITH_BROWSE);
    render(<FileManager />);

    await waitFor(() => expect(screen.getByText("/Users/test")).toBeInTheDocument());

    // Switch to sync (makes dirty)
    await user.click(screen.getByRole("button", { name: "Sync" }));
    await waitFor(() => expect(screen.getByText("Source")).toBeInTheDocument());

    // Discard
    await user.click(screen.getByRole("button", { name: "Discard" }));

    // Should be back to browse mode with original path
    await waitFor(() => {
      expect(screen.getByText("/Users/test")).toBeInTheDocument();
      expect(screen.queryByText("Source")).not.toBeInTheDocument();
    });
  });

  it("save persists the modified profile", async () => {
    const user = userEvent.setup();
    mockStore(STORE_WITH_BROWSE);
    render(<FileManager />);

    await waitFor(() => expect(screen.getByText("/Users/test")).toBeInTheDocument());

    // Switch to sync (makes dirty)
    await user.click(screen.getByRole("button", { name: "Sync" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Save profile" })).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: "Save profile" }));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith(
        "save_file_manager_profiles",
        expect.objectContaining({
          store: expect.objectContaining({
            profiles: [expect.objectContaining({ name: "Browse Test", mode: "sync" })],
          }),
        }),
      );
    });
  });

  // ── Sync exclusion filters ────────────────────────────────────

  it("shows filter toggle in sync mode when exclusions exist", async () => {
    mockStore(STORE_WITH_SYNC_EXCLUSIONS);
    render(<FileManager />);

    await waitFor(() => {
      // Both ProfileSelector and SyncManager may show filter buttons
      const filterButtons = screen.getAllByRole("button", { name: /Filters/i });
      expect(filterButtons.length).toBeGreaterThanOrEqual(1);
    });
  });

  it("does not show filter toggle in browse mode", async () => {
    // Use a browse profile that happens to have exclusions
    const store: FileManagerProfileStore = {
      profiles: [{ ...STORE_WITH_SYNC_EXCLUSIONS.profiles[0], mode: "browse", name: "Browse With Ex" }],
      active_profile: "Browse With Ex",
    };
    mockStore(store);
    render(<FileManager />);

    await waitFor(() => expect(screen.getByText("/src")).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: /Filters/i })).not.toBeInTheDocument();
  });

  // ── Error resilience ──────────────────────────────────────────

  it("handles backend load failure gracefully", async () => {
    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === "get_file_manager_profiles") throw new Error("Network error");
      return undefined;
    });

    render(<FileManager />);

    // Should still render empty state without crashing
    await waitFor(() => {
      expect(screen.getByText("Select or create a profile to get started")).toBeInTheDocument();
    });
  });
});
