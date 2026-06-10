import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import App from "./App";

const mockInvoke = vi.mocked(invoke);

const defaultInvoke = async (cmd: string) => {
  if (cmd === "detect_ipod") return null;
  if (cmd === "get_file_manager_profiles") return { profiles: [] };
  if (cmd === "get_library_location") return "/Users/test/Music";
  if (cmd === "get_library_browser_data") return { tracks: [], genres: [], artists: [], albums: [] };
  if (cmd === "get_library_browser_data_paginated")
    return {
      tracks: { tracks: [], total_count: 0 },
      genres: [],
      artists: [],
      albums: [],
      total_artist_count: 0,
      total_album_count: 0,
    };
  if (cmd === "get_library_tracks_page") return { tracks: [], total_count: 0 };
  if (cmd === "get_library_tracks") return [];
  if (cmd === "get_library_artists") return [];
  if (cmd === "get_library_albums") return [];
  if (cmd === "get_library_genres") return [];
  if (cmd === "get_playlists") return [];
  if (cmd === "get_smart_playlists") return [];
  if (cmd === "get_library_folders") return [];
  if (cmd === "get_discover_enabled") return true;
  return null;
};

beforeEach(() => {
  localStorage.clear();
  mockInvoke.mockReset();
  mockInvoke.mockImplementation(defaultInvoke);
});

describe("App", () => {
  it("renders the header", async () => {
    render(<App />);
    expect(await screen.findByText("Crate")).toBeInTheDocument();
  });

  it("shows Library and Tools top-level tabs", async () => {
    render(<App />);
    expect(await screen.findByRole("tab", { name: "Library" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Tools" })).toBeInTheDocument();
  });

  it("shows welcome screen when no library is configured", async () => {
    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === "get_library_location") return null;
      if (cmd === "detect_ipod") return null;
      if (cmd === "get_discover_enabled") return true;
      return null;
    });
    render(<App />);
    expect(await screen.findByText("Welcome to Crate")).toBeInTheDocument();
    expect(screen.getByText("Choose Music Folder")).toBeInTheDocument();
  });

  it("falls back to Library when the remembered tab is Discover but Discover is disabled", async () => {
    localStorage.setItem("crate-remember-last-tab", "true");
    localStorage.setItem("crate-last-top-tab", "discover");
    mockInvoke.mockImplementation(async (cmd: string) => (cmd === "get_discover_enabled" ? false : defaultInvoke(cmd)));

    render(<App />);

    const mainNav = await screen.findByRole("tablist", { name: "Main navigation" });
    await waitFor(() =>
      expect(within(mainNav).getByRole("tab", { name: "Library" })).toHaveAttribute("aria-selected", "true"),
    );
    expect(within(mainNav).queryByRole("tab", { name: "Discover" })).not.toBeInTheDocument();
  });

  it("restores the remembered Discover tab when Discover is enabled", async () => {
    localStorage.setItem("crate-remember-last-tab", "true");
    localStorage.setItem("crate-last-top-tab", "discover");

    render(<App />);

    const mainNav = await screen.findByRole("tablist", { name: "Main navigation" });
    await waitFor(() =>
      expect(within(mainNav).getByRole("tab", { name: "Discover" })).toHaveAttribute("aria-selected", "true"),
    );
  });

  it("switches to Tools tab and shows tool sub-tabs", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole("tab", { name: "Tools" }));
    expect(screen.getByRole("tab", { name: "File Manager" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Metadata" })).toBeInTheDocument();
  });

  it("shows File Manager tab within Tools", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole("tab", { name: "Tools" }));
    expect(screen.getByRole("tab", { name: "File Manager" })).toBeInTheDocument();
  });
});
