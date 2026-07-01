import type { ToolTabGroup } from "./types";

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
