import type { FileManagerProfile } from "../../../types/profiles";

export const emptyFileManagerProfile = (name: string, mode: "browse" | "sync" = "browse"): FileManagerProfile => ({
  name,
  mode,
  left_path: null,
  right_path: null,
  dual_pane: false,
  layout: "horizontal",
  exclusions: [],
});
