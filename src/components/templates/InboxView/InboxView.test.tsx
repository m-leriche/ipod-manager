import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { invoke } from "@tauri-apps/api/core";
import { emit } from "@tauri-apps/api/event";
import { UndoProvider } from "../../../contexts/UndoContext";
import { InboxView } from "./InboxView";
import type { CheckResult, InboxAlbum } from "./types";

const check = (status: CheckResult["status"], detail: string | null = null): CheckResult => ({ status, detail });

const album = (overrides: Partial<InboxAlbum> = {}): InboxAlbum => ({
  folder_path: "/inbox/Artist - Album",
  folder_name: "Artist - Album",
  artist: "Artist",
  album: "Album",
  year: 2020,
  tracks: [
    {
      file_path: "/inbox/Artist - Album/01.flac",
      file_name: "01.flac",
      title: "One",
      track_number: 1,
      disc_number: 1,
      duration_secs: 100,
      format: "FLAC",
      bitrate_kbps: null,
      sample_rate: 96000,
      bit_depth: 24,
    },
  ],
  checks: { tags: check("pass"), cover: check("pass"), tracklist: check("pass"), duplicate: check("pass") },
  ...overrides,
});

const mockBackend = (responses: Record<string, unknown>) => {
  vi.mocked(invoke).mockImplementation(async (cmd: string) => (cmd in responses ? responses[cmd] : undefined));
};

const renderView = () =>
  render(
    <UndoProvider>
      <InboxView />
    </UndoProvider>,
  );

describe("InboxView", () => {
  beforeEach(() => {
    mockBackend({ get_inbox_location: "/inbox", scan_inbox: [] });
  });

  it("prompts to configure an inbox folder when none is set", async () => {
    mockBackend({ get_inbox_location: null });
    renderView();

    expect(await screen.findByText("No inbox folder configured.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Open Settings" }));
    expect(emit).toHaveBeenCalledWith("open-settings");
  });

  it("shows an empty state when the inbox has no albums", async () => {
    renderView();
    expect(await screen.findByText("Inbox is empty.")).toBeInTheDocument();
  });

  it("surfaces scan failures instead of showing an empty inbox", async () => {
    vi.mocked(invoke).mockImplementation(async (cmd: string) => {
      if (cmd === "get_inbox_location") return "/inbox";
      if (cmd === "scan_inbox") throw new Error("Inbox folder not found: /inbox");
      return undefined;
    });
    renderView();

    expect(await screen.findByText(/Failed to scan inbox:.*not found/)).toBeInTheDocument();
    expect(screen.queryByText("Inbox is empty.")).not.toBeInTheDocument();
  });

  it("lists scanned albums with the inbox path", async () => {
    mockBackend({ get_inbox_location: "/inbox", scan_inbox: [album()] });
    renderView();

    expect(await screen.findByText("Album")).toBeInTheDocument();
    expect(screen.getByText("/inbox")).toBeInTheDocument();
  });

  it("verifies pending tracklists against MusicBrainz", async () => {
    mockBackend({
      get_inbox_location: "/inbox",
      scan_inbox: [
        album({
          checks: { tags: check("pass"), cover: check("pass"), tracklist: check("pending"), duplicate: check("pass") },
        }),
      ],
      verify_inbox_tracklist: check("pass", "Matches “Album” (1 tracks)"),
    });
    renderView();

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith("verify_inbox_tracklist", {
        artist: "Artist",
        album: "Album",
        trackCount: 1,
      });
    });
    expect(await screen.findByRole("button", { name: "File Away" })).toBeInTheDocument();
  });

  it("files an album away and removes it from the list", async () => {
    mockBackend({
      get_inbox_location: "/inbox",
      scan_inbox: [album()],
      file_inbox_album: {
        moves: [{ from: "/inbox/Artist - Album/01.flac", to: "/lib/Artist/Album/01-01 One.flac", is_audio: true }],
        errors: [],
      },
    });
    renderView();

    fireEvent.click(await screen.findByRole("button", { name: "File Away" }));

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith("file_inbox_album", { folderPath: "/inbox/Artist - Album" });
    });
    await waitFor(() => {
      expect(screen.queryByText("Album")).not.toBeInTheDocument();
    });
  });

  it("moves the original folder to the Trash in the background without a confirmation", async () => {
    mockBackend({
      get_inbox_location: "/inbox",
      scan_inbox: [album()],
      file_inbox_album: {
        moves: [{ from: "/inbox/Artist - Album/01.flac", to: "/lib/Artist/Album/01-01 One.flac", is_audio: true }],
        errors: [],
      },
    });
    renderView();

    fireEvent.click(await screen.findByRole("button", { name: "File Away" }));

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith("delete_inbox_folders", { folderPaths: ["/inbox/Artist - Album"] });
    });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("undoes a filing with Cmd+Z, after the Trash cleanup has finished", async () => {
    const moves = [{ from: "/inbox/Artist - Album/01.flac", to: "/lib/Artist/Album/01-01 One.flac", is_audio: true }];
    let resolveCleanup: () => void = () => {};
    vi.mocked(invoke).mockImplementation(async (cmd: string) => {
      if (cmd === "get_inbox_location") return "/inbox";
      if (cmd === "scan_inbox") return [album()];
      if (cmd === "file_inbox_album") return { moves, errors: [] };
      if (cmd === "delete_inbox_folders") return new Promise<void>((r) => (resolveCleanup = r));
      return undefined;
    });
    renderView();

    fireEvent.click(await screen.findByRole("button", { name: "File Away" }));
    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith("file_inbox_album", { folderPath: "/inbox/Artist - Album" });
    });

    fireEvent.keyDown(window, { key: "z", metaKey: true });

    // Undo can't race the cleanup: it only restores once the Trash move is done.
    expect(invoke).not.toHaveBeenCalledWith("undo_inbox_filing", expect.anything());
    resolveCleanup();

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith("undo_inbox_filing", { moves });
    });
  });

  it("disables File All Passing when no album is ready", async () => {
    mockBackend({
      get_inbox_location: "/inbox",
      scan_inbox: [
        album({
          checks: {
            tags: check("fail", "1 missing title"),
            cover: check("pass"),
            tracklist: check("pass"),
            duplicate: check("pass"),
          },
        }),
      ],
    });
    renderView();

    expect(await screen.findByRole("button", { name: "Override & File" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "File All Passing (0)" })).toBeDisabled();
  });

  it("converts an album in place and rescans", async () => {
    mockBackend({
      get_inbox_location: "/inbox",
      scan_inbox: [album()],
      convert_inbox_album: {
        success: true,
        cancelled: false,
        converted: 1,
        failed: 0,
        errors: [],
        output_paths: [],
        warnings: [],
      },
    });
    renderView();

    fireEvent.click(await screen.findByRole("button", { name: "Show files" }));
    fireEvent.click(screen.getByRole("button", { name: "Convert" }));

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith("convert_inbox_album", {
        folderPath: "/inbox/Artist - Album",
        targetFormat: "flac",
        sampleRate: 44100,
        bitDepth: 16,
        mp3Bitrate: null,
      });
    });
    // Rescan after conversion picks up the new formats
    await waitFor(() => {
      expect(vi.mocked(invoke).mock.calls.filter(([cmd]) => cmd === "scan_inbox").length).toBeGreaterThan(1);
    });
  });

  it("files all passing albums as one bulk operation", async () => {
    const ready = album();
    const blocked = album({
      folder_path: "/inbox/Other",
      folder_name: "Other",
      album: "Other",
      checks: {
        tags: check("fail", "1 missing title"),
        cover: check("pass"),
        tracklist: check("pass"),
        duplicate: check("pass"),
      },
    });
    mockBackend({
      get_inbox_location: "/inbox",
      scan_inbox: [ready, blocked],
      file_inbox_album: { moves: [{ from: "a", to: "b", is_audio: true }], errors: [] },
    });
    renderView();

    fireEvent.click(await screen.findByRole("button", { name: "File All Passing (1)" }));

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith("file_inbox_album", { folderPath: ready.folder_path });
    });
    expect(invoke).not.toHaveBeenCalledWith("file_inbox_album", { folderPath: blocked.folder_path });
  });
});
