import { describe, it, expect, vi } from "vitest";
import { buildActions, filterActions, fuzzyScore, groupActions } from "./helpers";
import type { CommandAction, CommandDeps } from "./types";

const makeDeps = (overrides: Partial<CommandDeps> = {}): CommandDeps => ({
  selectTab: vi.fn(),
  selectTool: vi.fn(),
  openSettings: vi.fn(),
  rescanLibrary: vi.fn(),
  toggleColumnBrowser: vi.fn(),
  toggleAlbumGrid: vi.fn(),
  toggleArtworkCarousel: vi.fn(),
  togglePlayPause: vi.fn(),
  nextTrack: vi.fn(),
  previousTrack: vi.fn(),
  discoverEnabled: true,
  ...overrides,
});

const action = (id: string, title: string, group = "General", keywords = ""): CommandAction => ({
  id,
  title,
  keywords,
  group,
  run: vi.fn(),
});

describe("fuzzyScore", () => {
  it("returns 0 when the query does not match", () => {
    expect(fuzzyScore("xyz", "Rescan Library")).toBe(0);
  });

  it("matches case-insensitively", () => {
    expect(fuzzyScore("RESCAN", "rescan library")).toBeGreaterThan(0);
    expect(fuzzyScore("rescan", "RESCAN LIBRARY")).toBeGreaterThan(0);
  });

  it("ranks earlier substring matches higher", () => {
    expect(fuzzyScore("library", "Library")).toBeGreaterThan(fuzzyScore("library", "Rescan Library"));
  });

  it("ranks substring matches above subsequence matches", () => {
    expect(fuzzyScore("grid", "Toggle Album Grid")).toBeGreaterThan(fuzzyScore("tgl", "Toggle Album Grid"));
  });

  it("matches subsequences across words", () => {
    expect(fuzzyScore("colbr", "Toggle Column Browser")).toBeGreaterThan(0);
  });

  it("requires every query character in order", () => {
    expect(fuzzyScore("brcol", "Toggle Column Browser")).toBe(0);
  });
});

describe("filterActions", () => {
  const actions = [
    action("a", "Go to Library", "Navigate"),
    action("b", "Rescan Library", "Library"),
    action("c", "Next Track", "Playback"),
  ];

  it("returns all actions for an empty query", () => {
    expect(filterActions(actions, "")).toEqual(actions);
    expect(filterActions(actions, "   ")).toEqual(actions);
  });

  it("drops actions that do not match", () => {
    const result = filterActions(actions, "library");
    expect(result.map((a) => a.id)).toEqual(["a", "b"]);
  });

  it("matches on keywords as well as title", () => {
    const withKeywords = [action("k", "Open Settings", "General", "preferences options")];
    expect(filterActions(withKeywords, "preferences")).toHaveLength(1);
  });

  it("ranks better matches first", () => {
    const result = filterActions(actions, "next");
    expect(result[0].id).toBe("c");
  });
});

describe("groupActions", () => {
  it("buckets actions by group, preserving first-appearance order", () => {
    const result = groupActions([
      action("a", "A", "Navigate"),
      action("b", "B", "Playback"),
      action("c", "C", "Navigate"),
    ]);
    expect(result.map((g) => g.group)).toEqual(["Navigate", "Playback"]);
    expect(result[0].actions.map((a) => a.id)).toEqual(["a", "c"]);
  });

  it("returns an empty list for no actions", () => {
    expect(groupActions([])).toEqual([]);
  });
});

describe("buildActions", () => {
  it("includes tabs, tools, views, playback, rescan, and settings", () => {
    const ids = buildActions(makeDeps()).map((a) => a.id);
    expect(ids).toContain("tab-library");
    expect(ids).toContain("tab-discover");
    expect(ids).toContain("tool-metadata");
    expect(ids).toContain("view-album-grid");
    expect(ids).toContain("playback-play-pause");
    expect(ids).toContain("library-rescan");
    expect(ids).toContain("settings-open");
  });

  it("omits the Discover tab when discover is disabled", () => {
    const ids = buildActions(makeDeps({ discoverEnabled: false })).map((a) => a.id);
    expect(ids).not.toContain("tab-discover");
    expect(ids).toContain("tab-library");
  });

  it("wires tab actions to selectTab", () => {
    const deps = makeDeps();
    const actions = buildActions(deps);
    actions.find((a) => a.id === "tab-inbox")?.run();
    expect(deps.selectTab).toHaveBeenCalledWith("inbox");
  });

  it("wires tool actions to selectTool", () => {
    const deps = makeDeps();
    const actions = buildActions(deps);
    actions.find((a) => a.id === "tool-duplicates")?.run();
    expect(deps.selectTool).toHaveBeenCalledWith("duplicates");
  });

  it("wires rescan and settings actions", () => {
    const deps = makeDeps();
    const actions = buildActions(deps);
    actions.find((a) => a.id === "library-rescan")?.run();
    actions.find((a) => a.id === "settings-open")?.run();
    expect(deps.rescanLibrary).toHaveBeenCalledTimes(1);
    expect(deps.openSettings).toHaveBeenCalledTimes(1);
  });
});
