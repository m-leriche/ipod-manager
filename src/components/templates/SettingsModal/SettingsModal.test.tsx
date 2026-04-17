import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { SettingsModal } from "./SettingsModal";
import type { LibraryFolder } from "../../../types/library";

const mockFolders: LibraryFolder[] = [
  { id: 1, path: "/Users/test/Music", added_at: 1700000000 },
  { id: 2, path: "/Users/test/Downloads/audio", added_at: 1700001000 },
];

describe("SettingsModal", () => {
  const onClose = vi.fn();
  const onLibraryChanged = vi.fn();

  beforeEach(() => {
    vi.mocked(invoke).mockImplementation(async (cmd: string) => {
      if (cmd === "get_library_folders") return mockFolders;
      return undefined;
    });
  });

  it("renders the settings title", async () => {
    render(<SettingsModal onClose={onClose} onLibraryChanged={onLibraryChanged} />);
    expect(screen.getByText("Settings")).toBeInTheDocument();
  });

  it("displays library folders", async () => {
    render(<SettingsModal onClose={onClose} onLibraryChanged={onLibraryChanged} />);
    await waitFor(() => {
      expect(screen.getByText("/Users/test/Music")).toBeInTheDocument();
      expect(screen.getByText("/Users/test/Downloads/audio")).toBeInTheDocument();
    });
  });

  it("shows empty state when no folders", async () => {
    vi.mocked(invoke).mockImplementation(async (cmd: string) => {
      if (cmd === "get_library_folders") return [];
      return undefined;
    });

    render(<SettingsModal onClose={onClose} onLibraryChanged={onLibraryChanged} />);
    await waitFor(() => {
      expect(screen.getByText(/No folders added yet/)).toBeInTheDocument();
    });
  });

  it("calls onClose when close button is clicked", async () => {
    render(<SettingsModal onClose={onClose} onLibraryChanged={onLibraryChanged} />);
    fireEvent.click(screen.getByText("\u00D7"));
    expect(onClose).toHaveBeenCalled();
  });

  it("calls onClose when Escape is pressed", async () => {
    render(<SettingsModal onClose={onClose} onLibraryChanged={onLibraryChanged} />);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  it("calls onClose when backdrop is clicked", async () => {
    render(<SettingsModal onClose={onClose} onLibraryChanged={onLibraryChanged} />);
    fireEvent.click(screen.getByTestId("settings-backdrop"));
    expect(onClose).toHaveBeenCalled();
  });

  it("removes a folder and refreshes", async () => {
    render(<SettingsModal onClose={onClose} onLibraryChanged={onLibraryChanged} />);
    await waitFor(() => {
      expect(screen.getByText("/Users/test/Music")).toBeInTheDocument();
    });

    const removeButtons = screen.getAllByText("Remove");
    fireEvent.click(removeButtons[0]);

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith("remove_library_folder", { path: "/Users/test/Music" });
      expect(onLibraryChanged).toHaveBeenCalled();
    });
  });

  it("adds a folder via directory picker", async () => {
    vi.mocked(open).mockResolvedValueOnce("/Users/test/NewFolder");

    render(<SettingsModal onClose={onClose} onLibraryChanged={onLibraryChanged} />);
    await waitFor(() => {
      expect(screen.getByText("Add Folder")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Add Folder"));

    await waitFor(() => {
      expect(open).toHaveBeenCalledWith({ directory: true, multiple: false });
      expect(invoke).toHaveBeenCalledWith("add_library_folder", { path: "/Users/test/NewFolder" });
      expect(onLibraryChanged).toHaveBeenCalled();
    });
  });

  it("does nothing when directory picker is cancelled", async () => {
    vi.mocked(open).mockResolvedValueOnce(null);

    render(<SettingsModal onClose={onClose} onLibraryChanged={onLibraryChanged} />);
    await waitFor(() => {
      expect(screen.getByText("Add Folder")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Add Folder"));

    await waitFor(() => {
      expect(open).toHaveBeenCalled();
    });
    expect(invoke).not.toHaveBeenCalledWith("add_library_folder", expect.anything());
  });
});
