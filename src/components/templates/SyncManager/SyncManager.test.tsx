import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { SyncManager } from "./SyncManager";

const mockInvoke = vi.mocked(invoke);
const mockOpen = vi.mocked(open);

const STORE_EMPTY = { profiles: [] };
const STORE_WITH_PROFILE = {
  profiles: [{ name: "Test", source_path: null, target_path: null, exclusions: [] }],
};
const STORE_WITH_PATHS = {
  profiles: [{ name: "Test", source_path: "/src", target_path: "/tgt", exclusions: [] }],
  active_profile: "Test",
};
const STORE_WITH_EXCLUSIONS = {
  profiles: [{ name: "Test", source_path: "/src", target_path: "/tgt", exclusions: ["node_modules"] }],
  active_profile: "Test",
};

beforeEach(() => {
  mockInvoke.mockReset();
  mockOpen.mockReset();
  mockInvoke.mockImplementation(async (cmd: string) => {
    if (cmd === "get_profiles") return STORE_EMPTY;
    if (cmd === "save_profiles") return undefined;
    return [];
  });
});

describe("SyncManager", () => {
  it("renders ProfileSelector", () => {
    render(<SyncManager />);
    expect(screen.getByText("Profile")).toBeInTheDocument();
  });

  it("shows empty state when no profile is selected", () => {
    render(<SyncManager />);
    expect(screen.getByText("Select or create a profile to start syncing folders")).toBeInTheDocument();
  });

  it("shows folder pickers when profile is selected", async () => {
    const user = userEvent.setup();
    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === "get_profiles") return STORE_WITH_PROFILE;
      if (cmd === "save_profiles") return undefined;
      return [];
    });
    render(<SyncManager />);

    await waitFor(() => {
      expect(screen.getByText("Test")).toBeInTheDocument();
    });

    await user.selectOptions(screen.getByRole("combobox"), "Test");

    await waitFor(() => {
      expect(screen.getByText("Source")).toBeInTheDocument();
      expect(screen.getByText("Target")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Compare Folders" })).toBeDisabled();
    });
  });

  it("shows no profile selected by default", () => {
    render(<SyncManager />);
    const select = screen.getByRole("combobox");
    expect(select).toHaveValue("");
  });

  it("enables Compare button when both paths are set", async () => {
    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === "get_profiles") return STORE_WITH_PATHS;
      if (cmd === "save_profiles") return undefined;
      return [];
    });
    render(<SyncManager />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Compare Folders" })).toBeEnabled();
    });
  });

  it("creates a new profile via New button", async () => {
    const user = userEvent.setup();
    render(<SyncManager />);

    // Wait for initial load
    await waitFor(() => expect(mockInvoke).toHaveBeenCalledWith("get_profiles"));

    await user.click(screen.getByTitle("Create profile"));
    const input = screen.getByPlaceholderText("Profile name");
    await user.type(input, "MyProfile");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith(
        "save_profiles",
        expect.objectContaining({
          store: expect.objectContaining({
            profiles: [expect.objectContaining({ name: "MyProfile" })],
            active_profile: "MyProfile",
          }),
        }),
      );
    });
  });

  it("browses for source folder", async () => {
    const user = userEvent.setup();
    mockOpen.mockResolvedValue("/new-source");
    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === "get_profiles") return STORE_WITH_PATHS;
      if (cmd === "save_profiles") return undefined;
      return [];
    });
    render(<SyncManager />);

    await waitFor(() => {
      expect(screen.getByText("Source")).toBeInTheDocument();
    });

    const browseButtons = screen.getAllByRole("button", { name: "Browse" });
    await user.click(browseButtons[0]);

    await waitFor(() => {
      expect(mockOpen).toHaveBeenCalledWith(expect.objectContaining({ directory: true }));
    });
  });

  it("deletes a profile after confirmation", async () => {
    const user = userEvent.setup();
    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === "get_profiles") return STORE_WITH_PATHS;
      if (cmd === "save_profiles") return undefined;
      return [];
    });
    render(<SyncManager />);

    // Wait for profile to load and be active
    await waitFor(() => {
      expect(screen.getByTitle("Delete profile")).toBeInTheDocument();
    });

    await user.click(screen.getByTitle("Delete profile"));

    // Wait for confirmation step
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument();
    });
    await user.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith(
        "save_profiles",
        expect.objectContaining({
          store: expect.objectContaining({ profiles: [] }),
        }),
      );
    });
  });

  it("shows filter panel when Filters button is clicked", async () => {
    const user = userEvent.setup();
    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === "get_profiles") return STORE_WITH_EXCLUSIONS;
      if (cmd === "save_profiles") return undefined;
      return [];
    });
    render(<SyncManager />);

    await waitFor(() => {
      const filtersBtn = screen.getByRole("button", { name: /Filters/i });
      expect(filtersBtn).toBeInTheDocument();
      return user.click(filtersBtn);
    });

    await waitFor(() => {
      expect(screen.getByText("node_modules")).toBeInTheDocument();
    });
  });

  it("restores active profile from store", async () => {
    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === "get_profiles") return STORE_WITH_PATHS;
      if (cmd === "save_profiles") return undefined;
      return [];
    });
    render(<SyncManager />);

    await waitFor(() => {
      // Profile should be auto-selected
      expect(screen.getByText("Source")).toBeInTheDocument();
      expect(screen.getByText("Target")).toBeInTheDocument();
    });
  });
});
