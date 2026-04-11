import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { SyncManager } from "./SyncManager";

const mockInvoke = vi.mocked(invoke);

const STORE_WITH_PROFILE = {
  profiles: [{ name: "Test", source_path: null, target_path: null, exclusions: [] }],
};

beforeEach(() => {
  mockInvoke.mockReset();
  mockInvoke.mockImplementation(async (cmd: string) => {
    if (cmd === "get_profiles") return { profiles: [] };
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
});
