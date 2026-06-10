import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { invoke } from "@tauri-apps/api/core";
import { LibrarySection } from "./LibrarySection";
import { getSetting } from "../../../utils/settings";
import { SORT_SETTINGS_CHANGED_EVENT } from "../LibraryPlayer/useLibraryData";

describe("LibrarySection", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.mocked(invoke).mockImplementation(async (cmd: string) => {
      if (cmd === "get_id3_version") return "v2.3";
      return undefined;
    });
  });

  it("renders default sort selects with persisted values", () => {
    localStorage.setItem("crate-sort-by", "year");
    localStorage.setItem("crate-sort-direction", "desc");
    render(<LibrarySection />);
    expect((screen.getByTestId("default-sort-by") as HTMLSelectElement).value).toBe("year");
    expect((screen.getByTestId("default-sort-direction") as HTMLSelectElement).value).toBe("desc");
  });

  it("persists sort field changes and notifies the library view", () => {
    const listener = vi.fn();
    window.addEventListener(SORT_SETTINGS_CHANGED_EVENT, listener);
    render(<LibrarySection />);

    fireEvent.change(screen.getByTestId("default-sort-by"), { target: { value: "date_added" } });

    expect(getSetting("sortBy")).toBe("date_added");
    expect(listener).toHaveBeenCalled();
    window.removeEventListener(SORT_SETTINGS_CHANGED_EVENT, listener);
  });

  it("persists album sort mode changes", () => {
    render(<LibrarySection />);
    fireEvent.change(screen.getByTestId("default-album-sort-mode"), { target: { value: "recent" } });
    expect(getSetting("albumSortMode")).toBe("recent");
  });

  it("persists auto-fetch toggles", () => {
    render(<LibrarySection />);
    fireEvent.click(screen.getByTestId("auto-fetch-art-toggle"));
    fireEvent.click(screen.getByTestId("auto-fetch-lyrics-toggle"));
    expect(getSetting("autoFetchAlbumArt")).toBe(true);
    expect(getSetting("autoFetchLyrics")).toBe(true);
  });

  it("loads the current ID3 version from the backend", async () => {
    vi.mocked(invoke).mockImplementation(async (cmd: string) => {
      if (cmd === "get_id3_version") return "v2.4";
      return undefined;
    });
    render(<LibrarySection />);
    await waitFor(() => {
      expect((screen.getByTestId("id3-version-v2.4") as HTMLInputElement).checked).toBe(true);
    });
  });

  it("saves the ID3 version via the backend when changed", async () => {
    render(<LibrarySection />);
    await waitFor(() => {
      expect((screen.getByTestId("id3-version-v2.3") as HTMLInputElement).checked).toBe(true);
    });

    fireEvent.click(screen.getByTestId("id3-version-v2.4"));

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith("set_id3_version", { version: "v2.4" });
    });
    expect((screen.getByTestId("id3-version-v2.4") as HTMLInputElement).checked).toBe(true);
  });

  it("reverts the ID3 version selection when saving fails", async () => {
    vi.mocked(invoke).mockImplementation(async (cmd: string) => {
      if (cmd === "get_id3_version") return "v2.3";
      if (cmd === "set_id3_version") throw new Error("db error");
      return undefined;
    });
    render(<LibrarySection />);
    await waitFor(() => {
      expect((screen.getByTestId("id3-version-v2.3") as HTMLInputElement).checked).toBe(true);
    });

    fireEvent.click(screen.getByTestId("id3-version-v2.4"));

    await waitFor(() => {
      expect((screen.getByTestId("id3-version-v2.3") as HTMLInputElement).checked).toBe(true);
    });
  });
});
