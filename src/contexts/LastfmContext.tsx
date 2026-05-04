import { createContext, useContext, useState, useCallback, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useToast } from "./ToastContext";
import type { LibraryTrack } from "../types/library";

// ── Types ───────────────────────────────────────────────────────

interface LastfmState {
  connected: boolean;
  username: string | null;
  scrobbleEnabled: boolean;
  queueCount: number;
  connecting: boolean;
}

interface LastfmActions {
  connect: () => Promise<void>;
  cancelConnect: () => void;
  disconnect: () => Promise<void>;
  setScrobbleEnabled: (enabled: boolean) => void;
}

interface LastfmStatusResponse {
  connected: boolean;
  username: string | null;
  scrobble_enabled: boolean;
  queue_count: number;
}

interface TokenResponse {
  token: string;
  auth_url: string;
}

// ── Contexts ────────────────────────────────────────────────────

const LastfmStateContext = createContext<LastfmState | null>(null);
const LastfmActionsContext = createContext<LastfmActions | null>(null);

// ── Provider ────────────────────────────────────────────────────

export const LastfmProvider = ({ children }: { children: React.ReactNode }) => {
  const [state, setState] = useState<LastfmState>({
    connected: false,
    username: null,
    scrobbleEnabled: true,
    queueCount: 0,
    connecting: false,
  });

  const toast = useToast();
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Hydrate on mount
  useEffect(() => {
    invoke<LastfmStatusResponse>("lastfm_get_status")
      .then((status) => {
        setState((prev) => ({
          ...prev,
          connected: status.connected,
          username: status.username,
          scrobbleEnabled: status.scrobble_enabled,
          queueCount: status.queue_count,
        }));
      })
      .catch(() => {});

    // Flush any offline scrobbles
    invoke("lastfm_flush_queue").catch(() => {});
  }, []);

  // Listen for playback events
  useEffect(() => {
    const onTrackStarted = (e: Event) => {
      const track = (e as CustomEvent<LibraryTrack>).detail;
      if (!track.artist || !track.title) return;
      invoke("lastfm_update_now_playing", {
        artist: track.artist,
        track: track.title,
        album: track.album ?? null,
        albumArtist: track.album_artist ?? null,
        durationSecs: track.duration_secs > 0 ? Math.round(track.duration_secs) : null,
      }).catch(() => {});
    };

    const onTrackScrobble = (e: Event) => {
      const { track, startedAt } = (e as CustomEvent<{ track: LibraryTrack; startedAt: number }>).detail;
      if (!track.artist || !track.title) return;
      invoke("lastfm_scrobble", {
        artist: track.artist,
        track: track.title,
        album: track.album ?? null,
        albumArtist: track.album_artist ?? null,
        durationSecs: Math.round(track.duration_secs),
        timestamp: startedAt,
      }).catch(() => {});
    };

    window.addEventListener("track-started", onTrackStarted);
    window.addEventListener("track-scrobble", onTrackScrobble);
    return () => {
      window.removeEventListener("track-started", onTrackStarted);
      window.removeEventListener("track-scrobble", onTrackScrobble);
    };
  }, []);

  const cancelConnect = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    setState((prev) => ({ ...prev, connecting: false }));
  }, []);

  const connect = useCallback(async () => {
    setState((prev) => ({ ...prev, connecting: true }));

    let tokenResponse: TokenResponse;
    try {
      tokenResponse = await invoke<TokenResponse>("lastfm_get_token");
    } catch (e) {
      toast.error(`Failed to start Last.fm auth: ${e}`);
      setState((prev) => ({ ...prev, connecting: false }));
      return;
    }

    // Open browser for user authorization
    invoke("lastfm_open_auth_url", { url: tokenResponse.auth_url }).catch(() => {});

    // Poll for session (every 3s, max 2 minutes)
    let attempts = 0;
    const maxAttempts = 40;

    pollRef.current = setInterval(async () => {
      attempts++;
      try {
        const username = await invoke<string>("lastfm_get_session", {
          token: tokenResponse.token,
        });
        // Success
        if (pollRef.current) clearInterval(pollRef.current);
        pollRef.current = null;
        setState({
          connected: true,
          username,
          scrobbleEnabled: true,
          queueCount: 0,
          connecting: false,
        });
        toast.success(`Connected to Last.fm as ${username}`);
        // Flush any queued scrobbles now that we're authenticated
        invoke("lastfm_flush_queue").catch(() => {});
      } catch {
        // User hasn't authorized yet — keep polling
        if (attempts >= maxAttempts) {
          if (pollRef.current) clearInterval(pollRef.current);
          pollRef.current = null;
          setState((prev) => ({ ...prev, connecting: false }));
          toast.error("Last.fm authorization timed out. Try again.");
        }
      }
    }, 3000);
  }, [toast]);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const disconnect = useCallback(async () => {
    try {
      await invoke("lastfm_disconnect");
      setState({
        connected: false,
        username: null,
        scrobbleEnabled: true,
        queueCount: 0,
        connecting: false,
      });
      toast.success("Disconnected from Last.fm");
    } catch (e) {
      toast.error(`Failed to disconnect: ${e}`);
    }
  }, [toast]);

  const setScrobbleEnabled = useCallback((enabled: boolean) => {
    invoke("lastfm_set_scrobble_enabled", { enabled }).catch(() => {});
    setState((prev) => ({ ...prev, scrobbleEnabled: enabled }));
  }, []);

  const actions: LastfmActions = { connect, cancelConnect, disconnect, setScrobbleEnabled };

  return (
    <LastfmStateContext.Provider value={state}>
      <LastfmActionsContext.Provider value={actions}>{children}</LastfmActionsContext.Provider>
    </LastfmStateContext.Provider>
  );
};

// ── Hooks ───────────────────────────────────────────────────────

export const useLastfmState = (): LastfmState => {
  const ctx = useContext(LastfmStateContext);
  if (!ctx) throw new Error("useLastfmState must be used within LastfmProvider");
  return ctx;
};

export const useLastfm = (): LastfmActions => {
  const ctx = useContext(LastfmActionsContext);
  if (!ctx) throw new Error("useLastfm must be used within LastfmProvider");
  return ctx;
};
