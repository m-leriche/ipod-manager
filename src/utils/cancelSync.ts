import { invoke } from "@tauri-apps/api/core";

export const cancelSync = async () => {
  try {
    await invoke("cancel_sync");
  } catch (_) {
    /* ignore */
  }
};
