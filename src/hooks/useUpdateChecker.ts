import { useState, useCallback } from "react";
import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

export interface UpdateState {
  checking: boolean;
  available: boolean;
  version: string | null;
  downloading: boolean;
  error: string | null;
}

export const useUpdateChecker = () => {
  const [state, setState] = useState<UpdateState>({
    checking: false,
    available: false,
    version: null,
    downloading: false,
    error: null,
  });

  const checkForUpdate = useCallback(async () => {
    setState((s) => ({ ...s, checking: true, error: null }));
    try {
      const update = await check();
      if (update) {
        setState((s) => ({ ...s, checking: false, available: true, version: update.version }));
        return update;
      }
      setState((s) => ({ ...s, checking: false, available: false }));
      return null;
    } catch (e) {
      setState((s) => ({ ...s, checking: false, error: String(e) }));
      return null;
    }
  }, []);

  const downloadAndInstall = useCallback(async () => {
    setState((s) => ({ ...s, downloading: true, error: null }));
    try {
      const update = await check();
      if (!update) return;
      await update.downloadAndInstall();
      await relaunch();
    } catch (e) {
      setState((s) => ({ ...s, downloading: false, error: String(e) }));
    }
  }, []);

  return { state, checkForUpdate, downloadAndInstall };
};
