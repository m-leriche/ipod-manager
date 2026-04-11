import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { ComparisonView } from "./ComparisonView";

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

describe("ComparisonView", () => {
  it("calls compare_directories on mount", async () => {
    mockInvoke.mockResolvedValue(ENTRIES);
    render(
      <ComparisonView
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
      <ComparisonView
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
      <ComparisonView
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
      <ComparisonView
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

  it("defaults to Differences filter", async () => {
    mockInvoke.mockResolvedValue(ENTRIES);
    render(
      <ComparisonView
        sourcePath="/source"
        targetPath="/target"
        exclusions={[]}
        onAddExclusion={vi.fn()}
        onBack={vi.fn()}
      />,
    );

    await waitFor(() => {
      // Should show non-same entries in tree nodes
      expect(screen.getByText("Artist1")).toBeInTheDocument();
      expect(screen.getByText("Artist2")).toBeInTheDocument();
      expect(screen.getByText("old")).toBeInTheDocument();
    });
  });

  it("shows tree nodes with folder names", async () => {
    mockInvoke.mockResolvedValue(ENTRIES);
    render(
      <ComparisonView
        sourcePath="/source"
        targetPath="/target"
        exclusions={[]}
        onAddExclusion={vi.fn()}
        onBack={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("Artist1")).toBeInTheDocument();
      expect(screen.getByText("Artist2")).toBeInTheDocument();
      expect(screen.getByText("old")).toBeInTheDocument();
    });
  });

  it("shows file names within expanded folders", async () => {
    mockInvoke.mockResolvedValue(ENTRIES);
    render(
      <ComparisonView
        sourcePath="/source"
        targetPath="/target"
        exclusions={[]}
        onAddExclusion={vi.fn()}
        onBack={vi.fn()}
      />,
    );

    // Folders with differences are auto-expanded
    await waitFor(() => {
      expect(screen.getByText("song1.mp3")).toBeInTheDocument();
      expect(screen.getByText("track1.mp3")).toBeInTheDocument();
      expect(screen.getByText("removed.mp3")).toBeInTheDocument();
    });
  });

  it("shows Mirror button with correct count", async () => {
    mockInvoke.mockResolvedValue(ENTRIES);
    render(
      <ComparisonView
        sourcePath="/source"
        targetPath="/target"
        exclusions={[]}
        onAddExclusion={vi.fn()}
        onBack={vi.fn()}
      />,
    );

    await waitFor(() => {
      // 1 source_only + 1 modified + 1 target_only = 3
      expect(screen.getByRole("button", { name: /Mirror 3 to iPod/ })).toBeInTheDocument();
    });
  });

  it("shows error when comparison fails", async () => {
    mockInvoke.mockRejectedValue("Source path not found");
    render(
      <ComparisonView
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
      <ComparisonView
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
      <ComparisonView
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
});
