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

/** Pick multiple files via the native dialog. Returns an array of paths or `null` if cancelled. */
export const pickFiles = async (title = "Select files", filters?: DialogFilter[]): Promise<string[] | null> => {
  const picked = await open({ multiple: true, title, filters });
  if (Array.isArray(picked)) return picked;
  if (typeof picked === "string") return [picked];
  return null;
};
