import { open } from "@tauri-apps/plugin-dialog";
import type { DialogFilter } from "@tauri-apps/plugin-dialog";

/** Pick a single folder via the native dialog. Returns the path or `null` if cancelled. */
export const pickFolder = async (title = "Select folder"): Promise<string | null> => {
  const picked = await open({ directory: true, multiple: false, title });
  return typeof picked === "string" ? picked : null;
};

/** Pick a single file via the native dialog. Returns the path or `null` if cancelled. */
export const pickFile = async (title = "Select file", filters?: DialogFilter[]): Promise<string | null> => {
  const picked = await open({ multiple: false, title, filters });
  return typeof picked === "string" ? picked : null;
};
