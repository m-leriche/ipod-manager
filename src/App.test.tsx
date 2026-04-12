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
    return null;
  });
});

describe("App", () => {
  it("renders the header", () => {
    render(<App />);
    expect(screen.getByText("Crate")).toBeInTheDocument();
  });

  it("shows all three tab buttons", () => {
    render(<App />);
    expect(screen.getByRole("button", { name: "File Explorer" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "File Sync" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Album Art" })).toBeInTheDocument();
  });

  it("defaults to File Explorer tab", () => {
    render(<App />);
    expect(screen.getByText("Choose a folder to explore its contents")).toBeInTheDocument();
  });

  it("switches to File Sync tab on click", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "File Sync" }));
    expect(screen.getByText("Profile")).toBeInTheDocument();
    expect(screen.getByText("Select or create a profile to start syncing folders")).toBeInTheDocument();
  });

  it("switches to Album Art tab on click", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "Album Art" }));
    expect(screen.getByText("Choose a music folder to scan for missing album art")).toBeInTheDocument();
  });
});
