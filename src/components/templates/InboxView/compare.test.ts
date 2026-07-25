import { describe, it, expect } from "vitest";
import type { MbMedium, MbTrack } from "../../../types/musicbrainz";
import { buildComparisonRows, describeMedia, diagnose, releaseYear, summarizeRows } from "./compare";
import type { InboxTrack, ReleaseComparison } from "./types";

const local = (track_number: number | null, title: string, disc_number: number | null = 1): InboxTrack => ({
  file_path: `/inbox/${disc_number}-${track_number}-${title}.flac`,
  file_name: `${title}.flac`,
  title,
  track_number,
  disc_number,
  duration_secs: 180,
  format: "FLAC",
  bitrate_kbps: null,
  sample_rate: 44100,
  bit_depth: 16,
});

const mb = (position: number, title: string, disc_number = 1): MbTrack => ({
  position,
  disc_number,
  title,
  artist: "Ty Segall",
  length_ms: 180000,
});

const comparison = (tracks: MbTrack[], media: MbMedium[]): ReleaseComparison => ({
  query_artist: "Ty Segall",
  query_album: "Melted",
  detail: {
    release: {
      id: "r1",
      title: "Melted",
      artist: "Ty Segall",
      date: "2010-04-27",
      disambiguation: null,
      track_count: tracks.length,
      score: 100,
    },
    media,
    tracks,
  },
  alternatives: [],
});

describe("buildComparisonRows", () => {
  it("pairs tracks by disc and track number", () => {
    const rows = buildComparisonRows([local(1, "Finger"), local(2, "Caesar")], [mb(1, "Finger"), mb(2, "Caesar")]);

    expect(rows).toHaveLength(2);
    expect(rows.map((r) => [r.local?.title, r.mb?.title])).toEqual([
      ["Finger", "Finger"],
      ["Caesar", "Caesar"],
    ]);
  });

  it("falls back to title when track numbers disagree", () => {
    const rows = buildComparisonRows([local(7, "Caesar")], [mb(2, "Caesar")]);

    expect(rows[0].local?.title).toBe("Caesar");
    expect(rows[0].mb?.title).toBe("Caesar");
  });

  it("ignores punctuation and case when matching by title", () => {
    const rows = buildComparisonRows([local(null, "Sad Fuzz")], [mb(3, "sad-fuzz!")]);

    expect(rows[0].local).not.toBeNull();
  });

  it("leaves a missing track unpaired rather than shifting later matches", () => {
    const rows = buildComparisonRows(
      [local(1, "Finger"), local(3, "Sad Fuzz")],
      [mb(1, "Finger"), mb(2, "Caesar"), mb(3, "Sad Fuzz")],
    );

    expect(rows.map((r) => r.local?.title ?? null)).toEqual(["Finger", null, "Sad Fuzz"]);
  });

  it("appends local files that are not on the release", () => {
    const rows = buildComparisonRows([local(1, "Finger"), local(2, "Bonus Take")], [mb(1, "Finger")]);

    expect(rows).toHaveLength(2);
    expect(rows[1].mb).toBeNull();
    expect(rows[1].local?.title).toBe("Bonus Take");
  });

  it("does not pair disc 1 track 1 with disc 2 track 1", () => {
    const rows = buildComparisonRows([local(1, "Finger", 1)], [mb(1, "Other", 2), mb(1, "Finger", 1)]);

    expect(rows.find((r) => r.mb?.disc_number === 2)?.local).toBeNull();
    expect(rows.find((r) => r.mb?.disc_number === 1)?.local?.title).toBe("Finger");
  });

  it("gives every row a unique key", () => {
    const rows = buildComparisonRows([local(1, "A"), local(1, "B", 2)], [mb(1, "A", 1), mb(1, "B", 2)]);

    expect(new Set(rows.map((r) => r.key)).size).toBe(rows.length);
  });
});

describe("summarizeRows", () => {
  it("counts matched, missing and extra separately", () => {
    const rows = buildComparisonRows([local(1, "Finger"), local(9, "Bonus")], [mb(1, "Finger"), mb(2, "Caesar")]);

    expect(summarizeRows(rows)).toEqual({ matched: 1, missing: 1, extra: 1 });
  });
});

describe("describeMedia", () => {
  it("reports a plain track count for a single disc", () => {
    expect(describeMedia([{ position: 1, format: "CD", track_count: 12 }], 12)).toBe("12 tracks");
  });

  it("breaks out the per-disc counts for a multi-disc release", () => {
    const media: MbMedium[] = [
      { position: 1, format: "CD", track_count: 11 },
      { position: 2, format: "CD", track_count: 10 },
    ];

    expect(describeMedia(media, 21)).toBe("2 discs · 11 + 10 tracks");
  });
});

describe("releaseYear", () => {
  it("takes the year from a full date", () => {
    expect(releaseYear("2010-04-27")).toBe("2010");
  });

  it("returns null when there is no date", () => {
    expect(releaseYear(null)).toBeNull();
  });
});

describe("diagnose", () => {
  const singleDisc: MbMedium[] = [{ position: 1, format: "CD", track_count: 2 }];

  it("confirms an exact match", () => {
    const tracks = [mb(1, "Finger"), mb(2, "Caesar")];
    const rows = buildComparisonRows([local(1, "Finger"), local(2, "Caesar")], tracks);

    expect(diagnose(rows, comparison(tracks, singleDisc), 2)).toBe("Every track matches this release.");
  });

  it("explains a folder that holds only one disc of a multi-disc release", () => {
    const tracks = [mb(1, "Finger"), mb(2, "Caesar"), mb(1, "Later", 2)];
    const media: MbMedium[] = [
      { position: 1, format: "CD", track_count: 2 },
      { position: 2, format: "CD", track_count: 1 },
    ];
    const rows = buildComparisonRows([local(1, "Finger"), local(2, "Caesar")], tracks);

    expect(diagnose(rows, comparison(tracks, media), 2)).toBe(
      "Your 2 tracks match disc 1 of this 2-disc release. The other disc may be in a separate folder.",
    );
  });

  it("suggests a deluxe edition when there are only extras", () => {
    const tracks = [mb(1, "Finger")];
    const rows = buildComparisonRows([local(1, "Finger"), local(2, "Bonus")], tracks);

    expect(diagnose(rows, comparison(tracks, singleDisc), 2)).toBe(
      "You have 1 extra track — this may be a deluxe or expanded edition.",
    );
  });

  it("reports a plain shortfall", () => {
    const tracks = [mb(1, "Finger"), mb(2, "Caesar")];
    const rows = buildComparisonRows([local(1, "Finger")], tracks);

    expect(diagnose(rows, comparison(tracks, singleDisc), 1)).toBe("Missing 1 of 2 tracks.");
  });

  it("calls out a different edition when tracks are both missing and extra", () => {
    const tracks = [mb(1, "Finger"), mb(2, "Caesar")];
    const rows = buildComparisonRows([local(1, "Finger"), local(9, "Bonus")], tracks);

    expect(diagnose(rows, comparison(tracks, singleDisc), 2)).toBe(
      "1 missing, 1 extra — this looks like a different edition.",
    );
  });
});
