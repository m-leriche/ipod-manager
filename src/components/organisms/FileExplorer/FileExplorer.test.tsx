import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { FileExplorer } from "./FileExplorer";

const mockInvoke = vi.mocked(invoke);

const FILES = [
  { name: "Music", is_dir: true, size: 0, modified: 1700000000 },
  { name: "Photos", is_dir: true, size: 0, modified: 1700000000 },
  { name: "song.mp3", is_dir: false, size: 5242880, modified: 1700000000 },
  { name: "readme.txt", is_dir: false, size: 1024, modified: 1700000000 },
];

beforeEach(() => {
  mockInvoke.mockReset();
});

describe("FileExplorer", () => {
  it("calls list_directory on mount and shows entries", async () => {
    mockInvoke.mockResolvedValue(FILES);
    render(<FileExplorer rootPath="/Volumes" rootLabel="Volumes" />);

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith("list_directory", { path: "/Volumes" });
    });

    await waitFor(() => {
      expect(screen.getByText("Music")).toBeInTheDocument();
      expect(screen.getByText("Photos")).toBeInTheDocument();
      expect(screen.getByText("song.mp3")).toBeInTheDocument();
      expect(screen.getByText("readme.txt")).toBeInTheDocument();
    });
  });

  it("shows folder and file counts in footer", async () => {
    mockInvoke.mockResolvedValue(FILES);
    render(<FileExplorer rootPath="/Volumes" rootLabel="Volumes" />);

    await waitFor(() => {
      expect(screen.getByText("2 folders, 2 files")).toBeInTheDocument();
    });
  });

  it("shows root label in breadcrumb", async () => {
    mockInvoke.mockResolvedValue(FILES);
    render(<FileExplorer rootPath="/Volumes" rootLabel="Volumes" />);

    await waitFor(() => {
      expect(screen.getByText("Volumes")).toBeInTheDocument();
    });
  });

  it("navigates into a directory on click", async () => {
    const user = userEvent.setup();
    mockInvoke
      .mockResolvedValueOnce(FILES) // initial load
      .mockResolvedValueOnce([]); // after clicking Music

    render(<FileExplorer rootPath="/Volumes" rootLabel="Volumes" />);

    await waitFor(() => screen.getByText("Music"));
    await user.click(screen.getByText("Music"));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith("list_directory", { path: "/Volumes/Music" });
    });
  });

  it("shows Select button when onSelectFolder is provided", async () => {
    mockInvoke.mockResolvedValue(FILES);
    const onSelect = vi.fn();
    render(<FileExplorer rootPath="/Volumes" rootLabel="Volumes" onSelectFolder={onSelect} />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Select" })).toBeInTheDocument();
    });
  });

  it("calls onSelectFolder when Select is clicked", async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValue(FILES);
    const onSelect = vi.fn();
    render(<FileExplorer rootPath="/Volumes" rootLabel="Volumes" onSelectFolder={onSelect} />);

    await waitFor(() => screen.getByRole("button", { name: "Select" }));
    await user.click(screen.getByRole("button", { name: "Select" }));

    expect(onSelect).toHaveBeenCalledWith("/Volumes");
  });

  it("shows Selected state when current path matches selectedFolder", async () => {
    mockInvoke.mockResolvedValue(FILES);
    render(<FileExplorer rootPath="/Volumes" rootLabel="Volumes" onSelectFolder={vi.fn()} selectedFolder="/Volumes" />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Selected/ })).toBeInTheDocument();
    });
  });

  it("shows empty folder message when directory is empty", async () => {
    mockInvoke.mockResolvedValue([]);
    render(<FileExplorer rootPath="/Volumes" rootLabel="Volumes" />);

    await waitFor(() => {
      expect(screen.getByText("Empty folder")).toBeInTheDocument();
    });
  });

  it("shows error message when directory listing fails", async () => {
    mockInvoke.mockRejectedValue("Permission denied");
    render(<FileExplorer rootPath="/Volumes" rootLabel="Volumes" />);

    await waitFor(() => {
      expect(screen.getByText("Permission denied")).toBeInTheDocument();
    });
  });

  it("disables back button at root when parent navigation is not allowed", async () => {
    mockInvoke.mockResolvedValue(FILES);
    render(<FileExplorer rootPath="/Volumes" rootLabel="Volumes" />);

    await waitFor(() => screen.getByText("Music"));
    // The back/up button (←) should be disabled at root
    const backBtn = screen.getByRole("button", { name: "←" });
    expect(backBtn).toBeDisabled();
  });

  it("enables back button at root when parent navigation is allowed", async () => {
    mockInvoke.mockResolvedValue(FILES);
    render(<FileExplorer rootPath="/Volumes" rootLabel="Volumes" allowParentNavigation />);

    // At /Volumes with parent nav, can go up to /
    await waitFor(() => screen.getByText("Music"));
    // The back button might not be disabled since we're not at /
    const backBtn = screen.getByRole("button", { name: "←" });
    expect(backBtn).toBeEnabled();
  });

  it("formats file sizes correctly", async () => {
    mockInvoke.mockResolvedValue([
      { name: "big.mp3", is_dir: false, size: 5242880, modified: 1700000000 },
      { name: "small.txt", is_dir: false, size: 1024, modified: 1700000000 },
    ]);
    render(<FileExplorer rootPath="/test" rootLabel="Test" />);

    await waitFor(() => {
      expect(screen.getByText("5.0 MB")).toBeInTheDocument();
      expect(screen.getByText("1.0 KB")).toBeInTheDocument();
    });
  });
});
