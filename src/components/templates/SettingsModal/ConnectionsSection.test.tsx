import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { invoke } from "@tauri-apps/api/core";
import { ConnectionsSection } from "./ConnectionsSection";

describe("ConnectionsSection", () => {
  beforeEach(() => {
    vi.mocked(invoke).mockImplementation(async (cmd: string) => {
      if (cmd === "get_discover_enabled") return true;
      if (cmd === "lastfm_get_status") return { connected: false, username: null, scrobble_enabled: false };
      return undefined;
    });
  });

  it("renders streaming, discover, and Last.fm groups", async () => {
    render(<ConnectionsSection />);
    await waitFor(() => {
      expect(screen.getByTestId("discover-toggle")).toBeInTheDocument();
    });
    expect(screen.getByText("Last.fm")).toBeInTheDocument();
  });
});
