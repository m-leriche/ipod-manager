import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ComparisonTrackRow } from "./ComparisonTrackRow";
import type { ComparisonRow, InboxTrack } from "./types";
import type { MbTrack } from "../../../types/musicbrainz";

const local = (title: string, duration_secs = 180): InboxTrack => ({
  file_path: `/inbox/${title}.flac`,
  file_name: `${title}.flac`,
  title,
  track_number: 1,
  disc_number: 1,
  duration_secs,
  format: "FLAC",
  bitrate_kbps: null,
  sample_rate: 44100,
  bit_depth: 16,
});

const mb = (title: string): MbTrack => ({
  position: 1,
  disc_number: 1,
  title,
  artist: "The Flaming Lips",
  length_ms: 180000,
});

const row = (overrides: Partial<ComparisonRow> = {}): ComparisonRow => ({
  key: "r",
  local: local("Yoshimi Battles the Pink Robots Pt. 1"),
  mb: mb("Yoshimi Battles the Pink Robots Pt. 1"),
  ...overrides,
});

describe("ComparisonTrackRow", () => {
  it("shows the release title and duration", () => {
    render(<ComparisonTrackRow row={row()} />);

    expect(screen.getByText("Yoshimi Battles the Pink Robots Pt. 1")).toBeInTheDocument();
    expect(screen.getByText("3:00")).toBeInTheDocument();
  });

  it("adds no annotation when the file matches cleanly", () => {
    const { container } = render(<ComparisonTrackRow row={row()} />);

    expect(container.textContent).not.toMatch(/tagged|your file/);
  });

  it("renders a long tag in full rather than truncating the text", () => {
    const longTitle = "Yoshimi Battles the Pink Robots Pt. 1 (Alternate Mix)";
    render(<ComparisonTrackRow row={row({ local: local(longTitle) })} />);

    expect(screen.getByText(`tagged “${longTitle}”`)).toBeInTheDocument();
  });

  it("exposes the full tag on hover for when the row does run out of room", () => {
    const longTitle = "Yoshimi Battles the Pink Robots Pt. 1 (Alternate Mix)";
    render(<ComparisonTrackRow row={row({ local: local(longTitle) })} />);

    expect(screen.getByText(`tagged “${longTitle}”`)).toHaveAttribute("title", `tagged “${longTitle}”`);
  });

  it("exposes the full track title on hover", () => {
    render(<ComparisonTrackRow row={row()} />);

    expect(screen.getByText("Yoshimi Battles the Pink Robots Pt. 1")).toHaveAttribute(
      "title",
      "Yoshimi Battles the Pink Robots Pt. 1",
    );
  });

  it("dims a track you do not have instead of labelling it", () => {
    const { container } = render(<ComparisonTrackRow row={row({ local: null })} />);

    expect(container.firstElementChild?.className).toContain("opacity-40");
    expect(container.textContent).not.toMatch(/missing/i);
  });

  it("falls back to the local file for a track that is not on the release", () => {
    render(<ComparisonTrackRow row={row({ mb: null, local: local("Untitled Jam", 132) })} />);

    expect(screen.getByText("Untitled Jam")).toBeInTheDocument();
    expect(screen.getByText("2:12")).toBeInTheDocument();
  });
});
