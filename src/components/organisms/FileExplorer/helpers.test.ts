import { describe, it, expect } from "vitest";
import { deleteConfirmMessage } from "./helpers";

describe("deleteConfirmMessage", () => {
  it("says moved to Trash for a single root-volume path", () => {
    expect(deleteConfirmMessage(["/Users/me/Music/song.mp3"])).toBe(
      'Are you sure you want to delete "song.mp3"? It will be moved to the Trash.',
    );
  });

  it("says moved to Trash for multiple root-volume paths", () => {
    expect(deleteConfirmMessage(["/Users/me/a.mp3", "/Users/me/b.mp3"])).toBe(
      "Are you sure you want to delete 2 items? They will be moved to the Trash.",
    );
  });

  it("says permanently removed for external volume paths", () => {
    expect(deleteConfirmMessage(["/Volumes/IPOD/Music/song.mp3"])).toBe(
      'Are you sure you want to delete "song.mp3"? It will be permanently removed.',
    );
    expect(deleteConfirmMessage(["/Volumes/IPOD/a.mp3", "/Volumes/IPOD/b.mp3"])).toBe(
      "Are you sure you want to delete 2 items? They will be permanently removed.",
    );
  });
});
