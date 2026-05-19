import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { RepairTrackRow } from "./RepairTrackRow";
import { issueKey, fieldLabel } from "./helpers";
import type { TrackMatch, TrackIssue } from "./types";
import type { TrackMetadata } from "../../../types/metadata";

const localTrack: TrackMetadata = {
  file_path: "/music/song.flac",
  file_name: "song.flac",
  title: "Come Together",
  artist: "Beatles",
  album: "Abbey Road",
  album_artist: null,
  sort_artist: null,
  sort_album_artist: null,
  track: 1,
  track_total: null,
  disc_number: null,
  disc_total: null,
  year: null,
  genre: "Rock",
};

const titleIssue: TrackIssue = {
  file_path: "/music/song.flac",
  kind: "TitleMismatch",
  severity: "Warning",
  field: "title",
  local_value: "Come Together",
  suggested_value: "Come Together (Remastered)",
  description: "Title differs from MusicBrainz",
};

const yearIssue: TrackIssue = {
  file_path: "/music/song.flac",
  kind: "YearMissing",
  severity: "Warning",
  field: "year",
  local_value: null,
  suggested_value: "1969",
  description: "Year missing",
};

const albumArtistIssue: TrackIssue = {
  file_path: "/music/song.flac",
  kind: "AlbumArtistMissing",
  severity: "Info",
  field: "album_artist",
  local_value: null,
  suggested_value: "The Beatles",
  description: "Album artist missing",
};

const matchWithIssues: TrackMatch = {
  local_track: localTrack,
  mb_track: { position: 1, title: "Come Together (Remastered)", artist: "The Beatles", length_ms: 260000 },
  match_confidence: 0.95,
  issues: [titleIssue, yearIssue, albumArtistIssue],
};

const matchNoIssues: TrackMatch = {
  local_track: localTrack,
  mb_track: { position: 1, title: "Come Together", artist: "Beatles", length_ms: 260000 },
  match_confidence: 1.0,
  issues: [],
};

describe("RepairTrackRow", () => {
  it("renders track header with title and track number", () => {
    render(<RepairTrackRow trackMatch={matchWithIssues} acceptedFixes={new Set()} onToggleFix={vi.fn()} />);
    // Title appears in header and possibly in diff table
    expect(screen.getAllByText("Come Together").length).toBeGreaterThanOrEqual(1);
    // Track number appears in header and matching fields
    expect(screen.getAllByText("1").length).toBeGreaterThanOrEqual(1);
  });

  it("shows diff count in header", () => {
    render(<RepairTrackRow trackMatch={matchWithIssues} acceptedFixes={new Set()} onToggleFix={vi.fn()} />);
    expect(screen.getByText("3 diffs")).toBeInTheDocument();
  });

  it("shows side-by-side diff table with field labels", () => {
    render(<RepairTrackRow trackMatch={matchWithIssues} acceptedFixes={new Set()} onToggleFix={vi.fn()} />);
    expect(screen.getByText("Title")).toBeInTheDocument();
    expect(screen.getByText("Year")).toBeInTheDocument();
    expect(screen.getByText("Album Artist")).toBeInTheDocument();
  });

  it("shows local and MB values side by side", () => {
    render(<RepairTrackRow trackMatch={matchWithIssues} acceptedFixes={new Set()} onToggleFix={vi.fn()} />);
    expect(screen.getByText("Come Together (Remastered)")).toBeInTheDocument();
    expect(screen.getByText("1969")).toBeInTheDocument();
    expect(screen.getByText("The Beatles")).toBeInTheDocument();
  });

  it("renders checkboxes for issues with suggestions", () => {
    render(<RepairTrackRow trackMatch={matchWithIssues} acceptedFixes={new Set()} onToggleFix={vi.fn()} />);
    const checkboxes = screen.getAllByRole("checkbox");
    expect(checkboxes).toHaveLength(3);
  });

  it("checks accepted fixes", () => {
    const accepted = new Set([issueKey(titleIssue)]);
    render(<RepairTrackRow trackMatch={matchWithIssues} acceptedFixes={accepted} onToggleFix={vi.fn()} />);
    const checkboxes = screen.getAllByRole("checkbox");
    const checkedBoxes = checkboxes.filter((cb) => (cb as HTMLInputElement).checked);
    expect(checkedBoxes).toHaveLength(1);
  });

  it("calls onToggleFix when checkbox is clicked", async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    render(<RepairTrackRow trackMatch={matchWithIssues} acceptedFixes={new Set()} onToggleFix={onToggle} />);
    const checkboxes = screen.getAllByRole("checkbox");
    await user.click(checkboxes[0]);
    expect(onToggle).toHaveBeenCalledWith(issueKey(titleIssue));
  });

  it("shows 'All fields match' when no issues", async () => {
    const user = userEvent.setup();
    render(<RepairTrackRow trackMatch={matchNoIssues} acceptedFixes={new Set()} onToggleFix={vi.fn()} />);
    // Expand by clicking header (no issues means collapsed by default)
    const header = screen.getByRole("button");
    await user.click(header);
    expect(screen.getByText("All fields match")).toBeInTheDocument();
  });

  it("shows matching fields in compact format", () => {
    render(<RepairTrackRow trackMatch={matchWithIssues} acceptedFixes={new Set()} onToggleFix={vi.fn()} />);
    // Genre should be in matching fields since there's no issue for it
    expect(screen.getByText(/Genre:/)).toBeInTheDocument();
    expect(screen.getByText("Rock")).toBeInTheDocument();
  });

  it("shows column headers", () => {
    render(<RepairTrackRow trackMatch={matchWithIssues} acceptedFixes={new Set()} onToggleFix={vi.fn()} />);
    expect(screen.getByText("Current")).toBeInTheDocument();
    expect(screen.getByText("MusicBrainz")).toBeInTheDocument();
  });

  it("collapses and expands on header click", async () => {
    const user = userEvent.setup();
    render(<RepairTrackRow trackMatch={matchWithIssues} acceptedFixes={new Set()} onToggleFix={vi.fn()} />);
    // Starts expanded (has issues)
    expect(screen.getByText("Current")).toBeInTheDocument();

    await user.click(screen.getByRole("button"));
    expect(screen.queryByText("Current")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button"));
    expect(screen.getByText("Current")).toBeInTheDocument();
  });
});

describe("fieldLabel", () => {
  it("maps known fields to display labels", () => {
    expect(fieldLabel("title")).toBe("Title");
    expect(fieldLabel("artist")).toBe("Artist");
    expect(fieldLabel("album")).toBe("Album");
    expect(fieldLabel("album_artist")).toBe("Album Artist");
    expect(fieldLabel("sort_artist")).toBe("Sort Artist");
    expect(fieldLabel("sort_album_artist")).toBe("Sort Album Artist");
    expect(fieldLabel("track")).toBe("Track #");
    expect(fieldLabel("track_total")).toBe("Track Total");
    expect(fieldLabel("year")).toBe("Year");
    expect(fieldLabel("genre")).toBe("Genre");
  });

  it("returns field name for unknown fields", () => {
    expect(fieldLabel("custom_field")).toBe("custom_field");
  });
});
