import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { MetadataEditor } from "./MetadataEditor";
import {
  groupTracks,
  buildUpdate,
  computeBatchFields,
  computeMixedFlags,
  trackToEditable,
  countTheArtists,
  fixTheArtists,
} from "./helpers";
import type { TrackMetadata } from "../../../types/metadata";

const mockInvoke = vi.mocked(invoke);
const mockOpen = vi.mocked(open);

const TRACKS: TrackMetadata[] = [
  {
    file_path: "/music/Beatles/Abbey Road/01 Come Together.mp3",
    file_name: "01 Come Together.mp3",
    title: "Come Together",
    artist: "The Beatles",
    album: "Abbey Road",
    album_artist: null,
    sort_artist: null,
    track: 1,
    track_total: 17,
    year: 1969,
    genre: "Rock",
  },
  {
    file_path: "/music/Beatles/Abbey Road/02 Something.mp3",
    file_name: "02 Something.mp3",
    title: "Something",
    artist: "The Beatles",
    album: "Abbey Road",
    album_artist: null,
    sort_artist: null,
    track: 2,
    track_total: 17,
    year: 1969,
    genre: "Rock",
  },
  {
    file_path: "/music/Floyd/DSOTM/01 Speak to Me.flac",
    file_name: "01 Speak to Me.flac",
    title: "Speak to Me",
    artist: "Pink Floyd",
    album: "The Dark Side of the Moon",
    album_artist: "Pink Floyd",
    sort_artist: null,
    track: 1,
    track_total: 10,
    year: 1973,
    genre: "Progressive Rock",
  },
];

beforeEach(() => {
  mockInvoke.mockReset();
  mockOpen.mockReset();
});

describe("MetadataEditor", () => {
  it("renders idle state with folder picker", () => {
    render(<MetadataEditor />);
    expect(screen.getByText("Choose a music folder to view and edit metadata")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Scan Metadata" })).toBeDisabled();
  });

  it("scans after folder selection", async () => {
    const user = userEvent.setup();
    mockOpen.mockResolvedValue("/music");
    mockInvoke.mockResolvedValue(TRACKS);

    render(<MetadataEditor />);
    await user.click(screen.getByRole("button", { name: "Browse" }));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith("scan_metadata", { path: "/music" });
    });
  });

  it("shows grouped tree after scan", async () => {
    const user = userEvent.setup();
    mockOpen.mockResolvedValue("/music");
    mockInvoke.mockResolvedValue(TRACKS);

    render(<MetadataEditor />);
    await user.click(screen.getByRole("button", { name: "Browse" }));

    await waitFor(() => {
      expect(screen.getByText("The Beatles")).toBeInTheDocument();
      expect(screen.getByText("Pink Floyd")).toBeInTheDocument();
      expect(screen.getByText("Abbey Road")).toBeInTheDocument();
      expect(screen.getByText("3 tracks")).toBeInTheDocument();
    });
  });

  it("shows Fix The Artists button when applicable", async () => {
    const user = userEvent.setup();
    mockOpen.mockResolvedValue("/music");
    mockInvoke.mockResolvedValue(TRACKS);

    render(<MetadataEditor />);
    await user.click(screen.getByRole("button", { name: "Browse" }));

    await waitFor(() => {
      const btn = screen.getByText((_, el) => el?.textContent === 'Fix "The" Artists (1)');
      expect(btn).toBeInTheDocument();
    });
  });

  it("shows error on scan failure", async () => {
    const user = userEvent.setup();
    mockOpen.mockResolvedValue("/music");
    mockInvoke.mockRejectedValue("Path does not exist");

    render(<MetadataEditor />);
    await user.click(screen.getByRole("button", { name: "Browse" }));

    await waitFor(() => {
      expect(screen.getByText("Path does not exist")).toBeInTheDocument();
    });
  });

  it("shows cancel button during scanning", async () => {
    const user = userEvent.setup();
    mockOpen.mockResolvedValue("/music");
    // Never resolve so we stay in scanning phase
    mockInvoke.mockReturnValue(new Promise(() => {}));

    render(<MetadataEditor />);
    await user.click(screen.getByRole("button", { name: "Browse" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
    });
  });

  it("calls cancel_sync when cancel is clicked", async () => {
    const user = userEvent.setup();
    mockOpen.mockResolvedValue("/music");
    mockInvoke.mockReturnValue(new Promise(() => {}));

    render(<MetadataEditor />);
    await user.click(screen.getByRole("button", { name: "Browse" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(mockInvoke).toHaveBeenCalledWith("cancel_sync");
  });

  it("returns to idle on cancelled scan", async () => {
    const user = userEvent.setup();
    mockOpen.mockResolvedValue("/music");
    mockInvoke.mockRejectedValue("Cancelled");

    render(<MetadataEditor />);
    await user.click(screen.getByRole("button", { name: "Browse" }));

    await waitFor(() => {
      expect(screen.getByText("Choose a music folder to view and edit metadata")).toBeInTheDocument();
    });
    // Should not show error for cancellation
    expect(screen.queryByText("Cancelled")).not.toBeInTheDocument();
  });

  it("shows banner and changes button after Fix The Artists", async () => {
    const user = userEvent.setup();
    mockOpen.mockResolvedValue("/music");
    mockInvoke.mockResolvedValue(TRACKS);

    render(<MetadataEditor />);
    await user.click(screen.getByRole("button", { name: "Browse" }));

    await waitFor(() => {
      expect(screen.getByText((_, el) => el?.textContent === 'Fix "The" Artists (1)')).toBeInTheDocument();
    });

    await user.click(screen.getByText((_, el) => el?.textContent === 'Fix "The" Artists (1)'));

    await waitFor(() => {
      // Banner shows with track count and action buttons
      expect(screen.getByText(/Updated album artist & sort artist for 2 tracks/)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Save All" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Undo" })).toBeInTheDocument();
      // Button changes to "Fixed" state and is disabled
      expect(screen.getByText((_, el) => el?.textContent === 'Fixed "The" Artists')).toBeInTheDocument();
      // Unsaved changes count shows
      expect(screen.getByText("2 unsaved changes")).toBeInTheDocument();
    });
  });

  it("shows save progress with cancel button during save", async () => {
    const user = userEvent.setup();
    mockOpen.mockResolvedValue("/music");
    // First invoke: scan_metadata returns tracks. Second: save_metadata hangs.
    mockInvoke.mockResolvedValueOnce(TRACKS).mockReturnValueOnce(new Promise(() => {}));

    render(<MetadataEditor />);
    await user.click(screen.getByRole("button", { name: "Browse" }));

    // Wait for scanned state
    await waitFor(() => {
      expect(screen.getByText("The Beatles")).toBeInTheDocument();
    });

    // Fix "The" artists to create dirty tracks
    await user.click(screen.getByText((_, el) => el?.textContent === 'Fix "The" Artists (1)'));

    await waitFor(() => {
      expect(screen.getByText("2 unsaved changes")).toBeInTheDocument();
    });

    // Select all Beatles tracks to see the edit panel + save button
    const beatlesCheckbox = screen.getAllByRole("checkbox")[0];
    await user.click(beatlesCheckbox);

    // Click save
    await waitFor(() => {
      expect(screen.getByText(/Save 2 Change/)).toBeInTheDocument();
    });
    await user.click(screen.getByText(/Save 2 Change/));

    // Should show saving progress UI with cancel button
    await waitFor(() => {
      expect(screen.getByText("Saving metadata...")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
    });
  });
});

// ── Helper tests ─────────────────────────────────────────────────

describe("groupTracks", () => {
  it("groups by artist then album", () => {
    const groups = groupTracks(TRACKS, {});
    expect(groups).toHaveLength(2);

    const beatles = groups.find((g) => g.artist === "The Beatles")!;
    expect(beatles.albums).toHaveLength(1);
    expect(beatles.albums[0].album).toBe("Abbey Road");
    expect(beatles.albums[0].tracks).toHaveLength(2);
    expect(beatles.trackCount).toBe(2);

    const floyd = groups.find((g) => g.artist === "Pink Floyd")!;
    expect(floyd.trackCount).toBe(1);
  });

  it("sorts tracks by track number within album", () => {
    const groups = groupTracks(TRACKS, {});
    const beatles = groups.find((g) => g.artist === "The Beatles")!;
    expect(beatles.albums[0].tracks[0].track).toBe(1);
    expect(beatles.albums[0].tracks[1].track).toBe(2);
  });

  it("uses edited values for grouping", () => {
    const edited = {
      [TRACKS[0].file_path]: { ...trackToEditable(TRACKS[0]), artist: "New Artist" },
    };
    const groups = groupTracks(TRACKS, edited);
    const newArtist = groups.find((g) => g.artist === "New Artist");
    expect(newArtist).toBeDefined();
    expect(newArtist!.trackCount).toBe(1);
  });

  it("puts [No Artist] last", () => {
    const noArtist: TrackMetadata = { ...TRACKS[0], artist: null, file_path: "/x.mp3" };
    const groups = groupTracks([noArtist, TRACKS[2]], {});
    expect(groups[groups.length - 1].artist).toBe("[No Artist]");
  });
});

describe("buildUpdate", () => {
  it("returns null when nothing changed", () => {
    const edited = trackToEditable(TRACKS[0]);
    expect(buildUpdate(TRACKS[0], edited)).toBeNull();
  });

  it("returns only changed fields", () => {
    const edited = { ...trackToEditable(TRACKS[0]), artist: "New Artist" };
    const update = buildUpdate(TRACKS[0], edited)!;
    expect(update.artist).toBe("New Artist");
    expect(update.title).toBeUndefined();
    expect(update.album).toBeUndefined();
  });

  it("handles numeric field changes", () => {
    const edited = { ...trackToEditable(TRACKS[0]), year: "2000" };
    const update = buildUpdate(TRACKS[0], edited)!;
    expect(update.year).toBe(2000);
  });
});

describe("computeBatchFields / computeMixedFlags", () => {
  it("shows shared values for identical fields", () => {
    const selected = TRACKS.slice(0, 2); // Both Beatles
    const fields = computeBatchFields(selected, {})!;
    expect(fields.artist).toBe("The Beatles");
    expect(fields.album).toBe("Abbey Road");
    expect(fields.genre).toBe("Rock");
  });

  it("marks mixed fields as empty string", () => {
    const fields = computeBatchFields(TRACKS, {})!;
    expect(fields.title).toBe(""); // All different titles
    expect(fields.artist).toBe(""); // Beatles vs Floyd
  });

  it("returns mixed flags correctly", () => {
    const flags = computeMixedFlags(TRACKS, {});
    expect(flags.artist).toBe(true); // Mixed
    expect(flags.genre).toBe(true); // Rock vs Progressive Rock
  });

  it("flags are false for identical fields", () => {
    const selected = TRACKS.slice(0, 2);
    const flags = computeMixedFlags(selected, {});
    expect(flags.artist).toBe(false);
    expect(flags.album).toBe(false);
  });
});

describe("trackToEditable", () => {
  it("converts nulls to empty strings", () => {
    const edited = trackToEditable(TRACKS[0]);
    expect(edited.album_artist).toBe("");
    expect(edited.sort_artist).toBe("");
  });

  it("converts numbers to strings", () => {
    const edited = trackToEditable(TRACKS[0]);
    expect(edited.track).toBe("1");
    expect(edited.year).toBe("1969");
  });
});

describe("countTheArtists", () => {
  it("counts unique artists starting with The", () => {
    expect(countTheArtists(TRACKS)).toBe(1); // "The Beatles"
  });

  it("ignores artists where The is mid-name", () => {
    const tracks: TrackMetadata[] = [{ ...TRACKS[0], artist: "Jimmy and The Bangles" }];
    expect(countTheArtists(tracks)).toBe(0);
  });

  it("returns 0 when no The artists", () => {
    expect(countTheArtists([TRACKS[2]])).toBe(0); // Pink Floyd
  });
});

describe("fixTheArtists", () => {
  it("stages album_artist and sort_artist for The artists", () => {
    const result = fixTheArtists(TRACKS, {});

    // Beatles tracks should be edited
    const edited0 = result[TRACKS[0].file_path];
    expect(edited0.album_artist).toBe("Beatles, The");
    expect(edited0.sort_artist).toBe("Beatles, The");
    expect(edited0.artist).toBe("The Beatles"); // Artist untouched

    // Floyd should not be edited
    expect(result[TRACKS[2].file_path]).toBeUndefined();
  });

  it("preserves existing edits", () => {
    const existing = {
      [TRACKS[0].file_path]: { ...trackToEditable(TRACKS[0]), genre: "Pop" },
    };
    const result = fixTheArtists(TRACKS, existing);
    expect(result[TRACKS[0].file_path].genre).toBe("Pop");
    expect(result[TRACKS[0].file_path].album_artist).toBe("Beatles, The");
  });
});
