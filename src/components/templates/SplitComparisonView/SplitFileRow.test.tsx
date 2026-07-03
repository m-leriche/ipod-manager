import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { SplitFileRow } from "./SplitFileRow";
import type { CompareEntry } from "../ComparisonView/types";

const entry = (status: CompareEntry["status"] = "source_only"): CompareEntry => ({
  relative_path: "Artist/song.mp3",
  is_dir: false,
  source_size: 5000,
  target_size: 4000,
  source_modified: null,
  target_modified: null,
  status,
});

describe("SplitFileRow", () => {
  it("renders the filename on both panes", () => {
    render(<SplitFileRow entry={entry()} depth={1} isSelected={false} onToggleFile={vi.fn()} />);
    expect(screen.getAllByText("song.mp3")).toHaveLength(2);
  });

  it("source_only file has its checkbox on the source side and toggles", async () => {
    const onToggleFile = vi.fn();
    render(<SplitFileRow entry={entry("source_only")} depth={1} isSelected onToggleFile={onToggleFile} />);
    const checkbox = screen.getByRole("checkbox") as HTMLInputElement;
    expect(checkbox.checked).toBe(true);
    await userEvent.click(checkbox);
    expect(onToggleFile).toHaveBeenCalledWith("Artist/song.mp3");
  });

  it("matching files have no checkbox", () => {
    render(<SplitFileRow entry={entry("same")} depth={1} isSelected={false} onToggleFile={vi.fn()} />);
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });

  it("shows the .mp3 name on the target side for transcoded pairs", () => {
    const transcodedEntry = { ...entry("same"), relative_path: "Artist/song.flac", transcoded: true };
    render(<SplitFileRow entry={transcodedEntry} depth={1} isSelected={false} onToggleFile={vi.fn()} />);
    expect(screen.getByText("song.flac")).toBeInTheDocument();
    expect(screen.getByText("song.mp3")).toBeInTheDocument();
  });
});
