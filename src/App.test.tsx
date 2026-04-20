import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import App from "./App";

const mockInvoke = vi.mocked(invoke);

beforeEach(() => {
  mockInvoke.mockReset();
  mockInvoke.mockImplementation(async (cmd: string) => {
    if (cmd === "detect_ipod") return null;
    if (cmd === "get_profiles") return { profiles: [] };
    if (cmd === "get_browse_profiles") return { profiles: [] };
    if (cmd === "get_library_location") return null;
    if (cmd === "get_library_browser_data") return { tracks: [], genres: [], artists: [], albums: [] };
    if (cmd === "get_library_tracks") return [];
    if (cmd === "get_library_artists") return [];
    if (cmd === "get_library_albums") return [];
    if (cmd === "get_library_genres") return [];
    return null;
  });
});

describe("App", () => {
  it("renders the header", () => {
    render(<App />);
    expect(screen.getByText("Crate")).toBeInTheDocument();
  });

  it("shows Library and Tools top-level tabs", () => {
    render(<App />);
    expect(screen.getByRole("button", { name: "Library" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tools" })).toBeInTheDocument();
  });

  it("defaults to Library tab with empty state", async () => {
    render(<App />);
    expect(await screen.findByText("Add your music library")).toBeInTheDocument();
  });

  it("switches to Tools tab and shows tool sub-tabs", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "Tools" }));
    expect(screen.getByRole("button", { name: "File Explorer" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "File Sync" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Album Art" })).toBeInTheDocument();
  });

  it("shows File Explorer content within Tools tab", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "Tools" }));
    expect(await screen.findByText("Choose a folder to explore its contents")).toBeInTheDocument();
  });
});
