import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { SettingsModal } from "./SettingsModal";

describe("SettingsModal", () => {
  const onClose = vi.fn();
  const onLibraryChanged = vi.fn();

  beforeEach(() => {
    localStorage.clear();
    vi.mocked(invoke).mockImplementation(async (cmd: string) => {
      if (cmd === "get_library_location") return "/Users/test/Music";
      if (cmd === "get_id3_version") return "v2.3";
      if (cmd === "get_discover_enabled") return true;
      return undefined;
    });
  });

  it("renders the settings title", async () => {
    render(<SettingsModal onClose={onClose} onLibraryChanged={onLibraryChanged} />);
    expect(screen.getByText("Settings")).toBeInTheDocument();
  });

  it("renders all section navigation items", async () => {
    render(<SettingsModal onClose={onClose} onLibraryChanged={onLibraryChanged} />);
    for (const section of ["general", "appearance", "playback", "library", "shortcuts", "connections"]) {
      expect(screen.getByTestId(`settings-nav-${section}`)).toBeInTheDocument();
    }
  });

  it("opens with the General section active", async () => {
    render(<SettingsModal onClose={onClose} onLibraryChanged={onLibraryChanged} />);
    expect(screen.getByTestId("settings-nav-general")).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("Library Location")).toBeInTheDocument();
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

  it("switches to the Appearance section showing themes", async () => {
    render(<SettingsModal onClose={onClose} onLibraryChanged={onLibraryChanged} />);
    fireEvent.click(screen.getByTestId("settings-nav-appearance"));
    expect(screen.getByTestId("settings-nav-appearance")).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("Theme")).toBeInTheDocument();
    expect(screen.getByText("Windows 95")).toBeInTheDocument();
  });

  it("switches to the Playback section showing crossfade", async () => {
    render(<SettingsModal onClose={onClose} onLibraryChanged={onLibraryChanged} />);
    fireEvent.click(screen.getByTestId("settings-nav-playback"));
    expect(screen.getByText("Crossfade")).toBeInTheDocument();
    expect(screen.getByTestId("crossfade-slider")).toBeInTheDocument();
  });

  it("switches to the Library section showing default sort and tag format", async () => {
    render(<SettingsModal onClose={onClose} onLibraryChanged={onLibraryChanged} />);
    fireEvent.click(screen.getByTestId("settings-nav-library"));
    expect(screen.getByText("Default Sort")).toBeInTheDocument();
    expect(screen.getByText("Tag Format")).toBeInTheDocument();
  });

  it("switches to the Shortcuts section", async () => {
    render(<SettingsModal onClose={onClose} onLibraryChanged={onLibraryChanged} />);
    fireEvent.click(screen.getByTestId("settings-nav-shortcuts"));
    expect(screen.getByText("Keyboard Shortcuts")).toBeInTheDocument();
    expect(screen.getByTestId("shortcut-playPause")).toBeInTheDocument();
  });

  it("switches to the Connections section", async () => {
    render(<SettingsModal onClose={onClose} onLibraryChanged={onLibraryChanged} />);
    fireEvent.click(screen.getByTestId("settings-nav-connections"));
    await waitFor(() => {
      expect(screen.getByTestId("discover-toggle")).toBeInTheDocument();
    });
  });

  it("calls onClose when close button is clicked", async () => {
    render(<SettingsModal onClose={onClose} onLibraryChanged={onLibraryChanged} />);
    fireEvent.click(screen.getByText("×"));
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
