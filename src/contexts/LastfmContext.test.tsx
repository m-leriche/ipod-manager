import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { invoke } from "@tauri-apps/api/core";

vi.unmock("./LastfmContext");
vi.unmock("./ToastContext");
import { LastfmProvider, useLastfmState, useLastfm } from "./LastfmContext";
import { ToastProvider } from "./ToastContext";

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <ToastProvider>
    <LastfmProvider>{children}</LastfmProvider>
  </ToastProvider>
);

beforeEach(() => {
  vi.useFakeTimers();
  vi.mocked(invoke).mockImplementation(async (cmd: string) => {
    if (cmd === "lastfm_get_status")
      return { connected: false, username: null, scrobble_enabled: true, queue_count: 0 };
    if (cmd === "lastfm_flush_queue") return undefined;
    return undefined;
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("LastfmContext", () => {
  it("useLastfmState throws when used outside provider", () => {
    expect(() => renderHook(() => useLastfmState())).toThrow("useLastfmState must be used within LastfmProvider");
  });

  it("useLastfm throws when used outside provider", () => {
    expect(() => renderHook(() => useLastfm())).toThrow("useLastfm must be used within LastfmProvider");
  });

  it("initial state hydrates from invoke('lastfm_get_status')", async () => {
    vi.mocked(invoke).mockImplementation(async (cmd: string) => {
      if (cmd === "lastfm_get_status")
        return { connected: true, username: "testuser", scrobble_enabled: false, queue_count: 3 };
      return undefined;
    });

    const { result } = renderHook(() => useLastfmState(), { wrapper });

    // Wait for hydration effect
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(result.current.connected).toBe(true);
    expect(result.current.username).toBe("testuser");
    expect(result.current.scrobbleEnabled).toBe(false);
    expect(result.current.queueCount).toBe(3);
  });

  it("connect() calls invoke for token, opens auth URL, and starts polling", async () => {
    vi.mocked(invoke).mockImplementation(async (cmd: string) => {
      if (cmd === "lastfm_get_status")
        return { connected: false, username: null, scrobble_enabled: true, queue_count: 0 };
      if (cmd === "lastfm_get_token") return { token: "abc123", auth_url: "https://last.fm/auth" };
      if (cmd === "lastfm_open_auth_url") return undefined;
      if (cmd === "lastfm_get_session") return "testuser";
      if (cmd === "lastfm_flush_queue") return undefined;
      return undefined;
    });

    const { result } = renderHook(() => ({ state: useLastfmState(), actions: useLastfm() }), { wrapper });

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    // Start connect
    await act(async () => {
      result.current.actions.connect();
    });

    expect(result.current.state.connecting).toBe(true);
    expect(vi.mocked(invoke)).toHaveBeenCalledWith("lastfm_get_token");

    // Advance past the first poll interval
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });

    expect(vi.mocked(invoke)).toHaveBeenCalledWith("lastfm_get_session", { token: "abc123" });
    expect(result.current.state.connected).toBe(true);
    expect(result.current.state.username).toBe("testuser");
    expect(result.current.state.connecting).toBe(false);
  });

  it("cancelConnect() stops polling and sets connecting=false", async () => {
    vi.mocked(invoke).mockImplementation(async (cmd: string) => {
      if (cmd === "lastfm_get_status")
        return { connected: false, username: null, scrobble_enabled: true, queue_count: 0 };
      if (cmd === "lastfm_get_token") return { token: "abc123", auth_url: "https://last.fm/auth" };
      if (cmd === "lastfm_open_auth_url") return undefined;
      if (cmd === "lastfm_get_session") throw new Error("not authorized yet");
      if (cmd === "lastfm_flush_queue") return undefined;
      return undefined;
    });

    const { result } = renderHook(() => ({ state: useLastfmState(), actions: useLastfm() }), { wrapper });

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    await act(async () => {
      result.current.actions.connect();
    });

    expect(result.current.state.connecting).toBe(true);

    act(() => {
      result.current.actions.cancelConnect();
    });

    expect(result.current.state.connecting).toBe(false);
  });

  it("disconnect() calls invoke and resets state", async () => {
    // Start in connected state
    vi.mocked(invoke).mockImplementation(async (cmd: string) => {
      if (cmd === "lastfm_get_status")
        return { connected: true, username: "testuser", scrobble_enabled: true, queue_count: 0 };
      if (cmd === "lastfm_disconnect") return undefined;
      if (cmd === "lastfm_flush_queue") return undefined;
      return undefined;
    });

    const { result } = renderHook(() => ({ state: useLastfmState(), actions: useLastfm() }), { wrapper });

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(result.current.state.connected).toBe(true);

    await act(async () => {
      await result.current.actions.disconnect();
    });

    expect(result.current.state.connected).toBe(false);
    expect(result.current.state.username).toBeNull();
    expect(vi.mocked(invoke)).toHaveBeenCalledWith("lastfm_disconnect");
  });

  it("setScrobbleEnabled() calls invoke and updates state", async () => {
    const { result } = renderHook(() => ({ state: useLastfmState(), actions: useLastfm() }), { wrapper });

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    act(() => {
      result.current.actions.setScrobbleEnabled(false);
    });

    expect(result.current.state.scrobbleEnabled).toBe(false);
    expect(vi.mocked(invoke)).toHaveBeenCalledWith("lastfm_set_scrobble_enabled", {
      enabled: false,
    });
  });

  it("polling timeout after max attempts shows error", async () => {
    vi.mocked(invoke).mockImplementation(async (cmd: string) => {
      if (cmd === "lastfm_get_status")
        return { connected: false, username: null, scrobble_enabled: true, queue_count: 0 };
      if (cmd === "lastfm_get_token") return { token: "abc123", auth_url: "https://last.fm/auth" };
      if (cmd === "lastfm_open_auth_url") return undefined;
      if (cmd === "lastfm_get_session") throw new Error("not authorized yet");
      if (cmd === "lastfm_flush_queue") return undefined;
      return undefined;
    });

    const { result } = renderHook(() => ({ state: useLastfmState(), actions: useLastfm() }), { wrapper });

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    await act(async () => {
      result.current.actions.connect();
    });

    // Advance through all 40 poll attempts (40 × 3000ms = 120s)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(120_000);
    });

    expect(result.current.state.connecting).toBe(false);
    expect(result.current.state.connected).toBe(false);
  });
});
