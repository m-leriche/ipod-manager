import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { UpdateSection } from "./UpdateSection";

const mockCheck = vi.fn();
const mockRelaunch = vi.fn();
vi.mock("@tauri-apps/plugin-updater", () => ({
  check: () => mockCheck(),
}));
vi.mock("@tauri-apps/plugin-process", () => ({
  relaunch: () => mockRelaunch(),
}));

const mockGetVersion = vi.fn().mockResolvedValue("1.0.0");
vi.mock("@tauri-apps/api/app", () => ({
  getVersion: () => mockGetVersion(),
}));

describe("UpdateSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCheck.mockResolvedValue(null);
  });

  it("renders current version", async () => {
    render(<UpdateSection />);
    expect(await screen.findByText("v1.0.0")).toBeInTheDocument();
  });

  it("shows 'You're up to date' by default", () => {
    render(<UpdateSection />);
    expect(screen.getByText("You're up to date")).toBeInTheDocument();
  });

  it("shows 'Checking...' while checking for updates", async () => {
    const user = userEvent.setup();
    let resolve: (v: null) => void;
    mockCheck.mockReturnValue(new Promise((r) => (resolve = r)));

    render(<UpdateSection />);
    await user.click(screen.getByText("Check for Updates"));
    expect(screen.getByText("Checking...")).toBeInTheDocument();

    resolve!(null);
  });

  it("shows update available when check finds one", async () => {
    const user = userEvent.setup();
    mockCheck.mockResolvedValue({ version: "2.0.0", downloadAndInstall: vi.fn() });

    render(<UpdateSection />);
    await user.click(screen.getByText("Check for Updates"));

    expect(await screen.findByText("v2.0.0 available")).toBeInTheDocument();
    expect(screen.getByText("Update & Restart")).toBeInTheDocument();
  });

  it("shows error when check fails", async () => {
    const user = userEvent.setup();
    mockCheck.mockRejectedValue(new Error("Network error"));

    render(<UpdateSection />);
    await user.click(screen.getByText("Check for Updates"));

    expect(await screen.findByText("Check failed")).toBeInTheDocument();
    expect(screen.getByText(/Network error/)).toBeInTheDocument();
  });

  it("triggers check on mount when autoCheck is true", async () => {
    mockCheck.mockResolvedValue({ version: "2.0.0", downloadAndInstall: vi.fn() });

    render(<UpdateSection autoCheck />);

    expect(await screen.findByText("v2.0.0 available")).toBeInTheDocument();
    expect(mockCheck).toHaveBeenCalledTimes(1);
  });

  it("does not auto-check when autoCheck is false", () => {
    render(<UpdateSection autoCheck={false} />);
    expect(mockCheck).not.toHaveBeenCalled();
    expect(screen.getByText("You're up to date")).toBeInTheDocument();
  });
});
