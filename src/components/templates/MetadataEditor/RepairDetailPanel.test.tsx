import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { RepairDetailPanel } from "./RepairDetailPanel";
import { issueKey } from "./helpers";
import type { AlbumRepairReport, TrackIssue } from "./types";
import type { TrackMetadata } from "../../../types/metadata";

const track1: TrackMetadata = {
  file_path: "/music/01.flac",
  file_name: "01.flac",
  title: "Song One",
  artist: "Artist",
  album: "Album",
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

const track2: TrackMetadata = {
  file_path: "/music/02.flac",
  file_name: "02.flac",
  title: "Song Two",
  artist: "Artist",
  album: "Album",
  album_artist: null,
  sort_artist: null,
  sort_album_artist: null,
  track: 2,
  track_total: null,
  disc_number: null,
  disc_total: null,
  year: null,
  genre: "Rock",
};

const titleIssue1: TrackIssue = {
  file_path: "/music/01.flac",
  kind: "TitleMismatch",
  severity: "Warning",
  field: "title",
  local_value: "Song One",
  suggested_value: "Song One (Remastered)",
  description: "Title differs",
};

const titleIssue2: TrackIssue = {
  file_path: "/music/02.flac",
  kind: "TitleMismatch",
  severity: "Warning",
  field: "title",
  local_value: "Song Two",
  suggested_value: "Song Two (Remastered)",
  description: "Title differs",
};

const trackNumIssue1: TrackIssue = {
  file_path: "/music/01.flac",
  kind: "TrackNumberWrong",
  severity: "Warning",
  field: "track",
  local_value: "1",
  suggested_value: "3",
  description: "Track number wrong",
};

const yearIssue1: TrackIssue = {
  file_path: "/music/01.flac",
  kind: "YearMissing",
  severity: "Info",
  field: "year",
  local_value: null,
  suggested_value: "2020",
  description: "Year missing",
};

const makeAlbum = (issues1: TrackIssue[], issues2: TrackIssue[]): AlbumRepairReport => ({
  artist: "Artist",
  album: "Album",
  folder_path: "/music",
  selected_release: {
    release: { id: "r1", title: "Album", artist: "Artist", date: "2020", track_count: 2, score: 100 },
    tracks: [
      { position: 1, title: "Song One (Remastered)", artist: "Artist", length_ms: 200000 },
      { position: 2, title: "Song Two (Remastered)", artist: "Artist", length_ms: 200000 },
    ],
  },
  alternative_releases: [],
  match_confidence: 0.95,
  track_matches: [
    {
      local_track: track1,
      mb_track: { position: 1, title: "Song One (Remastered)", artist: "Artist", length_ms: 200000 },
      match_confidence: 0.95,
      issues: issues1,
    },
    {
      local_track: track2,
      mb_track: { position: 2, title: "Song Two (Remastered)", artist: "Artist", length_ms: 200000 },
      match_confidence: 0.95,
      issues: issues2,
    },
  ],
  missing_tracks: [],
  issue_summary: { error_count: 0, warning_count: issues1.length + issues2.length, info_count: 0 },
});

describe("RepairDetailPanel — field toggle chips", () => {
  it("renders field toggle chips for each field with fixable issues", () => {
    const album = makeAlbum([titleIssue1, trackNumIssue1], [titleIssue2]);

    render(
      <RepairDetailPanel
        album={album}
        acceptedFixes={new Set()}
        onToggleFix={vi.fn()}
        onAcceptAll={vi.fn()}
        onClearAll={vi.fn()}
        onToggleField={vi.fn()}
        onSwitchRelease={vi.fn()}
        switching={false}
      />,
    );

    // Should show chips for both field types
    expect(screen.getByText(/Title \(0\/2\)/)).toBeInTheDocument();
    expect(screen.getByText(/Track # \(0\/1\)/)).toBeInTheDocument();
  });

  it("shows accepted count in chips", () => {
    const album = makeAlbum([titleIssue1, trackNumIssue1], [titleIssue2]);
    const accepted = new Set([issueKey(titleIssue1)]);

    render(
      <RepairDetailPanel
        album={album}
        acceptedFixes={accepted}
        onToggleFix={vi.fn()}
        onAcceptAll={vi.fn()}
        onClearAll={vi.fn()}
        onToggleField={vi.fn()}
        onSwitchRelease={vi.fn()}
        switching={false}
      />,
    );

    expect(screen.getByText(/Title \(1\/2\)/)).toBeInTheDocument();
    expect(screen.getByText(/Track # \(0\/1\)/)).toBeInTheDocument();
  });

  it("calls onToggleField with correct field name when chip is clicked", async () => {
    const user = userEvent.setup();
    const album = makeAlbum([titleIssue1, trackNumIssue1], [titleIssue2]);
    const onToggleField = vi.fn();

    render(
      <RepairDetailPanel
        album={album}
        acceptedFixes={new Set()}
        onToggleFix={vi.fn()}
        onAcceptAll={vi.fn()}
        onClearAll={vi.fn()}
        onToggleField={onToggleField}
        onSwitchRelease={vi.fn()}
        switching={false}
      />,
    );

    await user.click(screen.getByText(/Title \(0\/2\)/));
    expect(onToggleField).toHaveBeenCalledWith("title");

    await user.click(screen.getByText(/Track # \(0\/1\)/));
    expect(onToggleField).toHaveBeenCalledWith("track");
  });

  it("renders chip for a single field type", () => {
    const album = makeAlbum([yearIssue1], []);

    render(
      <RepairDetailPanel
        album={album}
        acceptedFixes={new Set()}
        onToggleFix={vi.fn()}
        onAcceptAll={vi.fn()}
        onClearAll={vi.fn()}
        onToggleField={vi.fn()}
        onSwitchRelease={vi.fn()}
        switching={false}
      />,
    );

    expect(screen.getByText(/Year \(0\/1\)/)).toBeInTheDocument();
  });
});
