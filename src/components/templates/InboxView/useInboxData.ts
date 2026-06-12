import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { CheckResult, InboxAlbum } from "./types";

export const useInboxData = () => {
  // undefined = still loading, null = not configured
  const [location, setLocation] = useState<string | null | undefined>(undefined);
  const [albums, setAlbums] = useState<InboxAlbum[]>([]);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const verifyRunRef = useRef(0);

  // Sequential MusicBrainz verification — the backend rate-limits to ~1 req/s
  const verifyTracklists = useCallback(async (toVerify: InboxAlbum[]) => {
    const run = ++verifyRunRef.current;
    for (const album of toVerify) {
      if (album.checks.tracklist.status !== "pending" || !album.artist || !album.album) continue;
      let result: CheckResult;
      try {
        result = await invoke<CheckResult>("verify_inbox_tracklist", {
          artist: album.artist,
          album: album.album,
          trackCount: album.tracks.length,
        });
      } catch (e) {
        result = { status: "warn", detail: `Could not verify: ${e}` };
      }
      if (verifyRunRef.current !== run) return;
      setAlbums((prev) =>
        prev.map((a) =>
          a.folder_path === album.folder_path ? { ...a, checks: { ...a.checks, tracklist: result } } : a,
        ),
      );
    }
  }, []);

  const rescan = useCallback(async () => {
    setScanning(true);
    try {
      const result = await invoke<InboxAlbum[]>("scan_inbox");
      setAlbums(result);
      setScanError(null);
      void verifyTracklists(result);
    } catch (e) {
      setAlbums([]);
      setScanError(String(e));
    } finally {
      setScanning(false);
    }
  }, [verifyTracklists]);

  useEffect(() => {
    invoke<string | null>("get_inbox_location")
      .then(setLocation)
      .catch(() => setLocation(null));
  }, []);

  useEffect(() => {
    if (location) void rescan();
  }, [location, rescan]);

  useEffect(() => {
    if (!location) return;
    let unlisten: (() => void) | undefined;
    listen("inbox-changed", () => void rescan()).then((fn) => {
      unlisten = fn;
    });
    return () => unlisten?.();
  }, [location, rescan]);

  return { location, albums, setAlbums, scanning, scanError, rescan };
};
