import type { ToolTab, ToolTabDef, ToolTabGroup } from "./types";

export const TOOL_GROUPS: ToolTabGroup[] = [
  {
    label: "File & Sync",
    tabs: [
      { id: "ipod", label: "iPod", description: "Mount and manage your Rockbox iPod Classic" },
      { id: "files", label: "File Manager", description: "Browse, copy, and organize files on disk" },
      { id: "export", label: "Export / Import", description: "Export your library or import playlists" },
    ],
  },
  {
    label: "Library Quality",
    tabs: [
      { id: "health", label: "Health", description: "Scan for missing art, tags, and quality issues" },
      { id: "duplicates", label: "Duplicates", description: "Find and remove duplicate tracks" },
      { id: "metadata", label: "Metadata", description: "Edit and repair track tags" },
      { id: "quality", label: "Quality", description: "Analyze audio quality and spot suspect transcodes" },
    ],
  },
  {
    label: "Audio Tools",
    tabs: [
      { id: "audio", label: "Audio Extractor", description: "Extract audio from local video files" },
      { id: "convert", label: "Converter", description: "Convert audio files between formats" },
    ],
  },
];

export const ALL_TOOL_TABS: ToolTabDef[] = TOOL_GROUPS.flatMap((group) => group.tabs);

export const getToolTab = (id: ToolTab): ToolTabDef => ALL_TOOL_TABS.find((tab) => tab.id === id) ?? ALL_TOOL_TABS[0];
