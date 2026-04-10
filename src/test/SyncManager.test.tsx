import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { SyncManager } from "../components/SyncManager";

const mockInvoke = vi.mocked(invoke);

beforeEach(() => {
  mockInvoke.mockReset();
  // FileExplorer calls list_directory on mount
  mockInvoke.mockResolvedValue([]);
});

describe("SyncManager", () => {
  it("renders dual explorer layout", () => {
    render(<SyncManager />);
    // Should show source and iPod path labels
    expect(screen.getByText("Source")).toBeInTheDocument();
    expect(screen.getByText("iPod")).toBeInTheDocument();
  });

  it("shows Compare Folders button", () => {
    render(<SyncManager />);
    expect(screen.getByRole("button", { name: "Compare Folders" })).toBeInTheDocument();
  });

  it("disables Compare button when no folders are selected", () => {
    render(<SyncManager />);
    expect(screen.getByRole("button", { name: "Compare Folders" })).toBeDisabled();
  });

  it("shows placeholder text for unselected folders", () => {
    render(<SyncManager />);
    expect(screen.getByText("Select folder on left")).toBeInTheDocument();
    expect(screen.getByText("Select folder on right")).toBeInTheDocument();
  });
});
