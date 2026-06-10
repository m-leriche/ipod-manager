import { describe, it, expect } from "vitest";
import { buildMatcher, previewFindReplace, stageChanges, previewTemplate } from "./batchOperations";
import type { FindReplaceOptions } from "./batchOperations";
import { trackToEditable } from "./helpers";
import type { TrackMetadata, MetadataTemplate } from "../../../types/metadata";
import type { EditableFields } from "./types";

const makeTrack = (overrides: Partial<TrackMetadata> = {}): TrackMetadata => ({
  file_path: "/music/a.mp3",
  file_name: "a.mp3",
  title: "Song (Remastered)",
  artist: "The Beatles",
  album: "Abbey Road (Remastered)",
  album_artist: "The Beatles",
  sort_artist: null,
  sort_album_artist: null,
  track: 1,
  track_total: 17,
  disc_number: null,
  disc_total: null,
  year: 1969,
  genre: "Rock",
  ...overrides,
});

const options = (overrides: Partial<FindReplaceOptions> = {}): FindReplaceOptions => ({
  fields: ["title"],
  find: "",
  replace: "",
  useRegex: false,
  caseSensitive: false,
  ...overrides,
});

describe("buildMatcher", () => {
  it("escapes special characters in literal mode", () => {
    const m = buildMatcher(options({ find: "(Remastered)" }));
    expect(m).not.toBeNull();
    expect("Song (Remastered)".replace(m!, "")).toBe("Song ");
  });

  it("compiles user regex in regex mode", () => {
    const m = buildMatcher(options({ find: "\\s*\\(Remastered\\)", useRegex: true }));
    expect("Song (Remastered)".replace(m!, "")).toBe("Song");
  });

  it("returns null for an invalid regex", () => {
    expect(buildMatcher(options({ find: "[unclosed", useRegex: true }))).toBeNull();
  });

  it("is case-insensitive by default and case-sensitive when requested", () => {
    expect("ROCK".replace(buildMatcher(options({ find: "rock" }))!, "x")).toBe("x");
    expect("ROCK".replace(buildMatcher(options({ find: "rock", caseSensitive: true }))!, "x")).toBe("ROCK");
  });
});

describe("previewFindReplace", () => {
  it("returns empty for an empty find string", () => {
    expect(previewFindReplace([makeTrack()], {}, options())).toEqual([]);
  });

  it("returns null for an invalid regex", () => {
    expect(previewFindReplace([makeTrack()], {}, options({ find: "[", useRegex: true }))).toBeNull();
  });

  it("finds literal matches in the chosen fields only", () => {
    const changes = previewFindReplace([makeTrack()], {}, options({ find: " (Remastered)", replace: "" }));
    expect(changes).toHaveLength(1);
    expect(changes![0]).toMatchObject({ field: "title", before: "Song (Remastered)", after: "Song" });
  });

  it("covers multiple fields when selected", () => {
    const changes = previewFindReplace(
      [makeTrack()],
      {},
      options({ fields: ["title", "album"], find: " (Remastered)", replace: "" }),
    );
    expect(changes).toHaveLength(2);
    expect(changes!.map((c) => c.field).sort()).toEqual(["album", "title"]);
  });

  it("replaces all occurrences", () => {
    const track = makeTrack({ title: "la la la" });
    const changes = previewFindReplace([track], {}, options({ find: "la", replace: "na" }));
    expect(changes![0].after).toBe("na na na");
  });

  it("supports regex capture groups", () => {
    const track = makeTrack({ title: "01 - Intro" });
    const changes = previewFindReplace([track], {}, options({ find: "^(\\d+) - ", replace: "", useRegex: true }));
    expect(changes![0].after).toBe("Intro");
  });

  it("treats replacement as literal text in literal mode", () => {
    const track = makeTrack({ title: "abc" });
    const changes = previewFindReplace([track], {}, options({ find: "b", replace: "$&$1" }));
    expect(changes![0].after).toBe("a$&$1c");
  });

  it("applies on top of already-staged edits", () => {
    const track = makeTrack();
    const edited: Record<string, EditableFields> = {
      [track.file_path]: { ...trackToEditable(track), title: "Edited Title (Remastered)" },
    };
    const changes = previewFindReplace([track], edited, options({ find: " (Remastered)", replace: "" }));
    expect(changes![0].before).toBe("Edited Title (Remastered)");
    expect(changes![0].after).toBe("Edited Title");
  });

  it("skips tracks without matches", () => {
    const tracks = [makeTrack(), makeTrack({ file_path: "/music/b.mp3", file_name: "b.mp3", title: "Clean" })];
    const changes = previewFindReplace(tracks, {}, options({ find: "(Remastered)", replace: "" }));
    expect(changes).toHaveLength(1);
    expect(changes![0].filePath).toBe("/music/a.mp3");
  });
});

describe("stageChanges", () => {
  it("stages changes into the edited-tracks record", () => {
    const track = makeTrack();
    const changes = previewFindReplace([track], {}, options({ find: " (Remastered)", replace: "" }))!;
    const staged = stageChanges([track], {}, changes);

    expect(staged[track.file_path].title).toBe("Song");
    // untouched fields keep their original values
    expect(staged[track.file_path].artist).toBe("The Beatles");
  });

  it("preserves unrelated staged edits", () => {
    const track = makeTrack();
    const prior: Record<string, EditableFields> = {
      [track.file_path]: { ...trackToEditable(track), genre: "Pop" },
    };
    const changes = previewFindReplace([track], prior, options({ find: " (Remastered)", replace: "" }))!;
    const staged = stageChanges([track], prior, changes);

    expect(staged[track.file_path].title).toBe("Song");
    expect(staged[track.file_path].genre).toBe("Pop");
  });

  it("ignores changes for unknown tracks", () => {
    const track = makeTrack();
    const staged = stageChanges([track], {}, [
      { filePath: "/missing.mp3", fileName: "missing.mp3", field: "title", before: "x", after: "y" },
    ]);
    expect(staged["/missing.mp3"]).toBeUndefined();
  });

  it("does not mutate the input record", () => {
    const track = makeTrack();
    const prior: Record<string, EditableFields> = {};
    stageChanges([track], prior, [
      { filePath: track.file_path, fileName: track.file_name, field: "title", before: "a", after: "b" },
    ]);
    expect(prior).toEqual({});
  });
});

describe("previewTemplate", () => {
  const template: MetadataTemplate = {
    id: "t1",
    name: "Compilation",
    fields: { album_artist: "Various Artists", genre: "Soundtrack" },
  };

  it("produces a change for every differing field on every track", () => {
    const tracks = [makeTrack(), makeTrack({ file_path: "/music/b.mp3", file_name: "b.mp3" })];
    const changes = previewTemplate(tracks, {}, template);
    expect(changes).toHaveLength(4);
  });

  it("skips fields that already match", () => {
    const track = makeTrack({ genre: "Soundtrack" });
    const changes = previewTemplate([track], {}, template);
    expect(changes).toHaveLength(1);
    expect(changes[0].field).toBe("album_artist");
  });

  it("compares against staged edits, not just originals", () => {
    const track = makeTrack();
    const edited: Record<string, EditableFields> = {
      [track.file_path]: { ...trackToEditable(track), album_artist: "Various Artists", genre: "Soundtrack" },
    };
    expect(previewTemplate([track], edited, template)).toHaveLength(0);
  });

  it("ignores non-whitelisted fields in the template", () => {
    // Simulates a template that bypassed the UI (e.g. hand-edited localStorage):
    // per-track fields like title must never be batch-overwritten.
    const bogus = {
      id: "t2",
      name: "Bogus",
      fields: { not_a_field: "x", title: "Hijacked" },
    } as unknown as MetadataTemplate;
    expect(previewTemplate([makeTrack()], {}, bogus)).toHaveLength(0);
  });
});
