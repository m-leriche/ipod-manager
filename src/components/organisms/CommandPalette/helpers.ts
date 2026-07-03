import { ALL_TOOL_TABS } from "../ToolsSidebar/constants";
import { TOP_TABS } from "./constants";
import type { CommandAction, CommandDeps, CommandGroup } from "./types";

/**
 * Score `query` against `text`. 0 means no match; higher is better.
 * Substring matches always outrank subsequence matches; earlier
 * substrings and subsequences hitting word starts rank higher.
 */
export const fuzzyScore = (query: string, text: string): number => {
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  if (q.length === 0) return 1;

  const substringIndex = t.indexOf(q);
  if (substringIndex >= 0) return 1000 - substringIndex;

  let score = 0;
  let searchFrom = 0;
  let lastMatch = -2;
  for (const ch of q) {
    const found = t.indexOf(ch, searchFrom);
    if (found === -1) return 0;
    score += 1;
    if (found === lastMatch + 1) score += 2;
    if (found === 0 || t[found - 1] === " ") score += 3;
    lastMatch = found;
    searchFrom = found + 1;
  }
  return score;
};

/** Filter and rank actions against a query. Empty query returns all actions. */
export const filterActions = (actions: CommandAction[], query: string): CommandAction[] => {
  const q = query.trim();
  if (q === "") return actions;
  return actions
    .map((action) => ({ action, score: Math.max(fuzzyScore(q, action.title), fuzzyScore(q, action.keywords)) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.action);
};

/** Bucket a flat (already ordered) action list into sections by first appearance. */
export const groupActions = (actions: CommandAction[]): CommandGroup[] => {
  const groups: CommandGroup[] = [];
  for (const action of actions) {
    const existing = groups.find((g) => g.group === action.group);
    if (existing) existing.actions.push(action);
    else groups.push({ group: action.group, actions: [action] });
  }
  return groups;
};

/** The full action list, wired to the callbacks the app provides. */
export const buildActions = (deps: CommandDeps): CommandAction[] => [
  ...TOP_TABS.filter((tab) => tab.id !== "discover" || deps.discoverEnabled).map((tab) => ({
    id: `tab-${tab.id}`,
    title: `Go to ${tab.label}`,
    keywords: `switch tab navigate ${tab.label}`,
    group: "Navigate",
    run: () => deps.selectTab(tab.id),
  })),
  ...ALL_TOOL_TABS.map((tool) => ({
    id: `tool-${tool.id}`,
    title: `Open ${tool.label}`,
    keywords: `tool ${tool.description}`,
    group: "Tools",
    run: () => deps.selectTool(tool.id),
  })),
  {
    id: "view-column-browser",
    title: "Toggle Column Browser",
    keywords: "view mode browse columns",
    group: "View",
    run: deps.toggleColumnBrowser,
  },
  {
    id: "view-album-grid",
    title: "Toggle Album Grid",
    keywords: "view mode albums covers grid",
    group: "View",
    run: deps.toggleAlbumGrid,
  },
  {
    id: "view-artwork-carousel",
    title: "Toggle Artwork Carousel",
    keywords: "view mode coverflow artwork carousel",
    group: "View",
    run: deps.toggleArtworkCarousel,
  },
  {
    id: "playback-play-pause",
    title: "Play / Pause",
    keywords: "playback toggle resume music",
    group: "Playback",
    run: deps.togglePlayPause,
  },
  {
    id: "playback-next",
    title: "Next Track",
    keywords: "playback skip forward song",
    group: "Playback",
    run: deps.nextTrack,
  },
  {
    id: "playback-previous",
    title: "Previous Track",
    keywords: "playback skip back song",
    group: "Playback",
    run: deps.previousTrack,
  },
  {
    id: "library-rescan",
    title: "Rescan Library",
    keywords: "refresh scan reload index music",
    group: "Library",
    run: deps.rescanLibrary,
  },
  {
    id: "settings-open",
    title: "Open Settings",
    keywords: "preferences options configure",
    group: "General",
    run: deps.openSettings,
  },
];
