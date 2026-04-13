import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { SplitComparisonView } from "./SplitComparisonView";

const mockInvoke = vi.mocked(invoke);

const ENTRIES = [
  {
    relative_path: "Artist1/song1.mp3",
    is_dir: false,
    source_size: 5000,
    target_size: null,
    source_modified: 1700000000,
    target_modified: null,
    status: "source_only" as const,
  },
  {
    relative_path: "Artist1/song2.mp3",
    is_dir: false,
    source_size: 6000,
    target_size: 6000,
    source_modified: 1700000000,
    target_modified: 1700000000,
    status: "same" as const,
  },
  {
    relative_path: "Artist2/track1.mp3",
    is_dir: false,
    source_size: 4000,
    target_size: 3500,
    source_modified: 1700002000,
    target_modified: 1700000000,
    status: "modified" as const,
  },
  {
    relative_path: "old/removed.mp3",
    is_dir: false,
    source_size: null,
    target_size: 3000,
    source_modified: null,
    target_modified: 1700000000,
    status: "target_only" as const,
  },
];

beforeEach(() => {
  mockInvoke.mockReset();
});

describe("SplitComparisonView", () => {
  it("calls compare_directories on mount", async () => {
    mockInvoke.mockResolvedValue(ENTRIES);
    render(
      <SplitComparisonView
        sourcePath="/source"
        targetPath="/target"
        exclusions={[]}
        onAddExclusion={vi.fn()}
        onBack={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith("compare_directories", {
        source: "/source",
        target: "/target",
      });
    });
  });

  it("displays stats after comparison", async () => {
    mockInvoke.mockResolvedValue(ENTRIES);
    render(
      <SplitComparisonView
        sourcePath="/source"
        targetPath="/target"
        exclusions={[]}
        onAddExclusion={vi.fn()}
        onBack={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getAllByText("1 new").length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText("1 modified").length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText("1 extra").length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText("1 matching")).toBeInTheDocument();
    });
  });

  it("shows source and target paths in header", async () => {
    mockInvoke.mockResolvedValue(ENTRIES);
    render(
      <SplitComparisonView
        sourcePath="/source"
        targetPath="/target"
        exclusions={[]}
        onAddExclusion={vi.fn()}
        onBack={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("/source")).toBeInTheDocument();
      expect(screen.getByText("/target")).toBeInTheDocument();
    });
  });

  it("calls onBack when Browse button is clicked", async () => {
    const user = userEvent.setup();
    const onBack = vi.fn();
    mockInvoke.mockResolvedValue(ENTRIES);
    render(
      <SplitComparisonView
        sourcePath="/source"
        targetPath="/target"
        exclusions={[]}
        onAddExclusion={vi.fn()}
        onBack={onBack}
      />,
    );

    await waitFor(() => screen.getByText("1 matching"));
    await user.click(screen.getByRole("button", { name: /Browse/ }));

    expect(onBack).toHaveBeenCalled();
  });

  it("shows column headers for Source and Target", async () => {
    mockInvoke.mockResolvedValue(ENTRIES);
    render(
      <SplitComparisonView
        sourcePath="/source"
        targetPath="/target"
        exclusions={[]}
        onAddExclusion={vi.fn()}
        onBack={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("Source")).toBeInTheDocument();
      // "Target" appears in header bar and column header
      expect(screen.getAllByText("Target").length).toBeGreaterThanOrEqual(1);
    });
  });

  it("shows folder names on both sides of split view", async () => {
    mockInvoke.mockResolvedValue(ENTRIES);
    render(
      <SplitComparisonView
        sourcePath="/source"
        targetPath="/target"
        exclusions={[]}
        onAddExclusion={vi.fn()}
        onBack={vi.fn()}
      />,
    );

    await waitFor(() => {
      // Each folder name appears twice — once on each side
      expect(screen.getAllByText("Artist1").length).toBe(2);
      expect(screen.getAllByText("Artist2").length).toBe(2);
      expect(screen.getAllByText("old").length).toBe(2);
    });
  });

  it("shows file names in expanded folders", async () => {
    mockInvoke.mockResolvedValue(ENTRIES);
    render(
      <SplitComparisonView
        sourcePath="/source"
        targetPath="/target"
        exclusions={[]}
        onAddExclusion={vi.fn()}
        onBack={vi.fn()}
      />,
    );

    await waitFor(() => {
      // source_only file shows name on both sides (one side as ghost)
      expect(screen.getAllByText("song1.mp3").length).toBe(2);
      // modified file shows on both sides
      expect(screen.getAllByText("track1.mp3").length).toBe(2);
      // target_only file shows on both sides (one side as ghost)
      expect(screen.getAllByText("removed.mp3").length).toBe(2);
    });
  });

  it("shows error when comparison fails", async () => {
    mockInvoke.mockRejectedValue("Source path not found");
    render(
      <SplitComparisonView
        sourcePath="/bad"
        targetPath="/target"
        exclusions={[]}
        onAddExclusion={vi.fn()}
        onBack={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("Source path not found")).toBeInTheDocument();
    });
  });

  it("shows in-sync message when no differences found", async () => {
    const sameEntries = [
      {
        relative_path: "song.mp3",
        is_dir: false,
        source_size: 5000,
        target_size: 5000,
        source_modified: 1700000000,
        target_modified: 1700000000,
        status: "same" as const,
      },
    ];
    mockInvoke.mockResolvedValue(sameEntries);
    render(
      <SplitComparisonView
        sourcePath="/source"
        targetPath="/target"
        exclusions={[]}
        onAddExclusion={vi.fn()}
        onBack={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText(/no differences found/)).toBeInTheDocument();
    });
  });

  it("has filter buttons", async () => {
    mockInvoke.mockResolvedValue(ENTRIES);
    render(
      <SplitComparisonView
        sourcePath="/source"
        targetPath="/target"
        exclusions={[]}
        onAddExclusion={vi.fn()}
        onBack={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Differences" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "All" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "New" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Extra" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Modified" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Matching" })).toBeInTheDocument();
    });
  });

  it("shows Mirror button with correct count", async () => {
    mockInvoke.mockResolvedValue(ENTRIES);
    render(
      <SplitComparisonView
        sourcePath="/source"
        targetPath="/target"
        exclusions={[]}
        onAddExclusion={vi.fn()}
        onBack={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Mirror 3 to iPod/ })).toBeInTheDocument();
    });
  });
});
