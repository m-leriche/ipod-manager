import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import App from "../App";

const mockInvoke = vi.mocked(invoke);

beforeEach(() => {
  mockInvoke.mockReset();
  // MountPanel calls detect_ipod on mount — default to no iPod found
  mockInvoke.mockResolvedValue(null);
});

describe("App", () => {
  it("renders the header", () => {
    render(<App />);
    expect(screen.getByText("iPod Manager")).toBeInTheDocument();
  });

  it("shows both tab buttons", () => {
    render(<App />);
    expect(screen.getByRole("button", { name: "File Sync" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Album Art" })).toBeInTheDocument();
  });

  it("defaults to Album Art tab", () => {
    render(<App />);
    // Album Art tab active, AlbumArtManager renders its idle UI
    expect(screen.getByText("Choose a music folder to scan for missing album art")).toBeInTheDocument();
  });

  it("disables File Sync tab when iPod is not mounted", () => {
    render(<App />);
    expect(screen.getByRole("button", { name: "File Sync" })).toBeDisabled();
  });

  it("does not switch to File Sync when disabled", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "File Sync" }));
    // Should still show Album Art content
    expect(screen.getByText("Choose a music folder to scan for missing album art")).toBeInTheDocument();
  });
});
