import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { SettingsModal } from "./SettingsModal";

describe("SettingsModal", () => {
  const onClose = vi.fn();
  const onLibraryChanged = vi.fn();

  beforeEach(() => {
    vi.mocked(invoke).mockImplementation(async (cmd: string) => {
      if (cmd === "get_library_location") return "/Users/test/Music";
      return undefined;
    });
  });

  it("renders the settings title", async () => {
    render(<SettingsModal onClose={onClose} onLibraryChanged={onLibraryChanged} />);
    expect(screen.getByText("Settings")).toBeInTheDocument();
  });

  it("displays current library location", async () => {
    render(<SettingsModal onClose={onClose} onLibraryChanged={onLibraryChanged} />);
    await waitFor(() => {
      expect(screen.getByText("/Users/test/Music")).toBeInTheDocument();
    });
  });

  it("shows 'Not configured' when no location set", async () => {
    vi.mocked(invoke).mockImplementation(async (cmd: string) => {
      if (cmd === "get_library_location") return null;
      return undefined;
    });

    render(<SettingsModal onClose={onClose} onLibraryChanged={onLibraryChanged} />);
    await waitFor(() => {
      expect(screen.getByText("Not configured")).toBeInTheDocument();
    });
  });

  it("shows 'Choose' button when no location, 'Change' when set", async () => {
    vi.mocked(invoke).mockImplementation(async (cmd: string) => {
      if (cmd === "get_library_location") return null;
      return undefined;
    });

    const { unmount } = render(<SettingsModal onClose={onClose} onLibraryChanged={onLibraryChanged} />);
    await waitFor(() => {
      expect(screen.getByText("Choose")).toBeInTheDocument();
    });
    unmount();

    vi.mocked(invoke).mockImplementation(async (cmd: string) => {
      if (cmd === "get_library_location") return "/Users/test/Music";
      return undefined;
    });

    render(<SettingsModal onClose={onClose} onLibraryChanged={onLibraryChanged} />);
    await waitFor(() => {
      expect(screen.getByText("Change")).toBeInTheDocument();
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

  it("sets library location via directory picker", async () => {
    vi.mocked(open).mockResolvedValueOnce("/Users/test/NewLibrary");

    render(<SettingsModal onClose={onClose} onLibraryChanged={onLibraryChanged} />);
    await waitFor(() => {
      expect(screen.getByText("Change")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Change"));

    await waitFor(() => {
      expect(open).toHaveBeenCalledWith({ directory: true, multiple: false, title: "Choose library location" });
      expect(invoke).toHaveBeenCalledWith("set_library_location", { path: "/Users/test/NewLibrary" });
      expect(onLibraryChanged).toHaveBeenCalled();
    });
  });

  it("does nothing when directory picker is cancelled", async () => {
    vi.mocked(open).mockResolvedValueOnce(null);

    render(<SettingsModal onClose={onClose} onLibraryChanged={onLibraryChanged} />);
    await waitFor(() => {
      expect(screen.getByText("Change")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Change"));

    await waitFor(() => {
      expect(open).toHaveBeenCalled();
    });
    expect(invoke).not.toHaveBeenCalledWith("set_library_location", expect.anything());
  });
});
