import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderHook } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

vi.unmock("./BackgroundLyricsContext");

// Must import after mocks
const { BackgroundLyricsProvider, useBackgroundLyrics } = await import("./BackgroundLyricsContext");

const mockInvoke = vi.mocked(invoke);
const mockListen = vi.mocked(listen);

describe("BackgroundLyricsContext", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListen.mockImplementation(() => Promise.resolve(() => {}));
    mockInvoke.mockImplementation(() => Promise.resolve());
  });

  it("provides initial idle state", () => {
    const { result } = renderHook(() => useBackgroundLyrics(), {
      wrapper: ({ children }) => <BackgroundLyricsProvider>{children}</BackgroundLyricsProvider>,
    });

    expect(result.current.state).toEqual({
      active: false,
      total: 0,
      completed: 0,
      currentItem: "",
    });
  });

  it("shows result dialog after successful lyrics fetch", async () => {
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === "fetch_library_lyrics") {
        return Promise.resolve({
          total: 20,
          fetched: 15,
          already_had: 3,
          not_found: 2,
          skipped_not_found: 0,
          cancelled: false,
        });
      }
      return Promise.resolve();
    });

    const TestConsumer = () => {
      const { start } = useBackgroundLyrics();
      return <button onClick={start}>Fetch</button>;
    };

    render(
      <BackgroundLyricsProvider>
        <TestConsumer />
      </BackgroundLyricsProvider>,
    );

    await userEvent.click(screen.getByText("Fetch"));

    await screen.findByText("Lyrics Fetch");
    expect(screen.getByText(/15 found/)).toBeInTheDocument();
    expect(screen.getByText(/2 not found/)).toBeInTheDocument();
  });

  it("shows cancelled message when cancelled", async () => {
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === "fetch_library_lyrics") {
        return Promise.resolve({
          total: 20,
          fetched: 5,
          already_had: 0,
          not_found: 0,
          skipped_not_found: 0,
          cancelled: true,
        });
      }
      return Promise.resolve();
    });

    const TestConsumer = () => {
      const { start } = useBackgroundLyrics();
      return <button onClick={start}>Fetch</button>;
    };

    render(
      <BackgroundLyricsProvider>
        <TestConsumer />
      </BackgroundLyricsProvider>,
    );

    await userEvent.click(screen.getByText("Fetch"));
    await screen.findByText("Fetch Cancelled");
    expect(screen.getByText(/Lyrics fetch was cancelled/)).toBeInTheDocument();
  });

  it("shows 'all tracks already have lyrics' when total is 0", async () => {
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === "fetch_library_lyrics") {
        return Promise.resolve({
          total: 0,
          fetched: 0,
          already_had: 0,
          not_found: 0,
          skipped_not_found: 0,
          cancelled: false,
        });
      }
      return Promise.resolve();
    });

    const TestConsumer = () => {
      const { start } = useBackgroundLyrics();
      return <button onClick={start}>Fetch</button>;
    };

    render(
      <BackgroundLyricsProvider>
        <TestConsumer />
      </BackgroundLyricsProvider>,
    );

    await userEvent.click(screen.getByText("Fetch"));
    await screen.findByText("Lyrics Fetch");
    expect(screen.getByText(/already have lyrics/)).toBeInTheDocument();
  });

  it("shows Retry Unfound button when there are not-found tracks", async () => {
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === "fetch_library_lyrics") {
        return Promise.resolve({
          total: 10,
          fetched: 5,
          already_had: 0,
          not_found: 5,
          skipped_not_found: 0,
          cancelled: false,
        });
      }
      return Promise.resolve();
    });

    const TestConsumer = () => {
      const { start } = useBackgroundLyrics();
      return <button onClick={start}>Fetch</button>;
    };

    render(
      <BackgroundLyricsProvider>
        <TestConsumer />
      </BackgroundLyricsProvider>,
    );

    await userEvent.click(screen.getByText("Fetch"));
    await screen.findByText("Lyrics Fetch");
    expect(screen.getByText("Retry Unfound")).toBeInTheDocument();
  });

  it("calls reset_lyrics_not_found and restarts on retry", async () => {
    let fetchCount = 0;
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === "fetch_library_lyrics") {
        fetchCount++;
        return Promise.resolve({
          total: 10,
          fetched: 5,
          already_had: 0,
          not_found: 5,
          skipped_not_found: 0,
          cancelled: false,
        });
      }
      return Promise.resolve();
    });

    const TestConsumer = () => {
      const { start } = useBackgroundLyrics();
      return <button onClick={start}>Fetch</button>;
    };

    render(
      <BackgroundLyricsProvider>
        <TestConsumer />
      </BackgroundLyricsProvider>,
    );

    await userEvent.click(screen.getByText("Fetch"));
    await screen.findByText("Retry Unfound");

    await userEvent.click(screen.getByText("Retry Unfound"));

    // Should have called reset_lyrics_not_found
    expect(mockInvoke).toHaveBeenCalledWith("reset_lyrics_not_found");
    // And started a second fetch
    expect(fetchCount).toBe(2);
  });
});
