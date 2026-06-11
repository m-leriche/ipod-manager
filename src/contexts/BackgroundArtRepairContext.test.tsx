import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderHook } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

vi.unmock("./BackgroundArtRepairContext");

vi.mock("./ArtCacheContext", () => ({
  useArtCache: () => ({ artCacheBust: 0, bumpArtCache: vi.fn() }),
}));

// Must import after mocks are set up
const { BackgroundArtRepairProvider, useBackgroundArtRepair } = await import("./BackgroundArtRepairContext");

const mockInvoke = vi.mocked(invoke);
const mockListen = vi.mocked(listen);

describe("BackgroundArtRepairContext", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListen.mockImplementation(() => Promise.resolve(() => {}));
    mockInvoke.mockImplementation(() => Promise.resolve());
  });

  it("provides initial idle state", () => {
    const { result } = renderHook(() => useBackgroundArtRepair(), {
      wrapper: ({ children }) => <BackgroundArtRepairProvider>{children}</BackgroundArtRepairProvider>,
    });

    expect(result.current.state).toEqual({
      active: false,
      total: 0,
      completed: 0,
      currentItem: "",
    });
  });

  it("shows result dialog after successful operation", async () => {
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === "fix_library_album_art") {
        return Promise.resolve({
          total: 10,
          fixed: 5,
          already_ok: 3,
          failed: 2,
          cancelled: false,
          errors: [],
        });
      }
      return Promise.resolve();
    });

    const TestConsumer = () => {
      const { start } = useBackgroundArtRepair();
      return <button onClick={() => start()}>Start</button>;
    };

    render(
      <BackgroundArtRepairProvider>
        <TestConsumer />
      </BackgroundArtRepairProvider>,
    );

    await userEvent.click(screen.getByText("Start"));

    // Wait for the result dialog
    await screen.findByText("Album Art Repair");
    expect(screen.getByText(/5 fixed/)).toBeInTheDocument();
    expect(screen.getByText(/2 not found/)).toBeInTheDocument();
  });

  it("scopes the command to the given paths and ignores non-array args", async () => {
    const TestConsumer = () => {
      const { start } = useBackgroundArtRepair();
      return (
        <>
          <button onClick={() => start(["/music/A/B/01-01 a.flac"])}>Scoped</button>
          <button onClick={start as unknown as React.MouseEventHandler<HTMLButtonElement>}>Full</button>
        </>
      );
    };

    render(
      <BackgroundArtRepairProvider>
        <TestConsumer />
      </BackgroundArtRepairProvider>,
    );

    await userEvent.click(screen.getByText("Scoped"));
    expect(mockInvoke).toHaveBeenLastCalledWith("fix_library_album_art", {
      scopePaths: ["/music/A/B/01-01 a.flac"],
    });

    // Passing start directly as an event handler must not leak the event as a scope
    await userEvent.click(screen.getByText("Full"));
    expect(mockInvoke).toHaveBeenLastCalledWith("fix_library_album_art", undefined);
  });

  it("shows cancelled dialog when operation is cancelled", async () => {
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === "fix_library_album_art") {
        return Promise.resolve({
          total: 10,
          fixed: 3,
          already_ok: 0,
          failed: 0,
          cancelled: true,
          errors: [],
        });
      }
      return Promise.resolve();
    });

    const TestConsumer = () => {
      const { start } = useBackgroundArtRepair();
      return <button onClick={() => start()}>Start</button>;
    };

    render(
      <BackgroundArtRepairProvider>
        <TestConsumer />
      </BackgroundArtRepairProvider>,
    );

    await userEvent.click(screen.getByText("Start"));

    await screen.findByText("Repair Cancelled");
    expect(screen.getByText(/3 albums fixed before cancellation/)).toBeInTheDocument();
  });

  it("dismisses result dialog on OK", async () => {
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === "fix_library_album_art") {
        return Promise.resolve({
          total: 0,
          fixed: 0,
          already_ok: 0,
          failed: 0,
          cancelled: false,
          errors: [],
        });
      }
      return Promise.resolve();
    });

    const TestConsumer = () => {
      const { start } = useBackgroundArtRepair();
      return <button onClick={() => start()}>Start</button>;
    };

    render(
      <BackgroundArtRepairProvider>
        <TestConsumer />
      </BackgroundArtRepairProvider>,
    );

    await userEvent.click(screen.getByText("Start"));
    await screen.findByText("Album Art Repair");

    await userEvent.click(screen.getByText("OK"));
    expect(screen.queryByText("Album Art Repair")).not.toBeInTheDocument();
  });

  it("handles error from start command", async () => {
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === "fix_library_album_art") return Promise.reject("Disk error");
      return Promise.resolve();
    });

    const TestConsumer = () => {
      const { start } = useBackgroundArtRepair();
      return <button onClick={() => start()}>Start</button>;
    };

    render(
      <BackgroundArtRepairProvider>
        <TestConsumer />
      </BackgroundArtRepairProvider>,
    );

    await userEvent.click(screen.getByText("Start"));
    // Error result should still show a dialog
    await screen.findByText("Album Art Repair");
  });
});
