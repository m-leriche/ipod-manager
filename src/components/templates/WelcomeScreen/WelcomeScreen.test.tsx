import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { WelcomeScreen } from "./WelcomeScreen";

const mockInvoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({ invoke: (...args: unknown[]) => mockInvoke(...args) }));

const mockListen = vi.fn().mockResolvedValue(vi.fn());
vi.mock("@tauri-apps/api/event", () => ({ listen: (...args: unknown[]) => mockListen(...args) }));

const mockPickFolder = vi.fn();
vi.mock("../../../utils/pickPath", () => ({ pickFolder: (...args: unknown[]) => mockPickFolder(...args) }));

describe("WelcomeScreen", () => {
  const onComplete = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders welcome message and choose button", () => {
    render(<WelcomeScreen onComplete={onComplete} />);
    expect(screen.getByText("Welcome to Crate")).toBeInTheDocument();
    expect(screen.getByText("Choose Music Folder")).toBeInTheDocument();
  });

  it("calls onComplete after successful folder selection and scan", async () => {
    const user = userEvent.setup();
    mockPickFolder.mockResolvedValue("/Users/test/Music");
    mockInvoke.mockResolvedValue(undefined);

    render(<WelcomeScreen onComplete={onComplete} />);
    await user.click(screen.getByText("Choose Music Folder"));

    expect(mockPickFolder).toHaveBeenCalledWith("Choose your music library folder");
    expect(mockInvoke).toHaveBeenCalledWith("set_library_location", { path: "/Users/test/Music" });
    expect(onComplete).toHaveBeenCalled();
  });

  it("does nothing if folder picker is cancelled", async () => {
    const user = userEvent.setup();
    mockPickFolder.mockResolvedValue(null);

    render(<WelcomeScreen onComplete={onComplete} />);
    await user.click(screen.getByText("Choose Music Folder"));

    expect(mockInvoke).not.toHaveBeenCalled();
    expect(onComplete).not.toHaveBeenCalled();
  });

  it("shows error on scan failure", async () => {
    const user = userEvent.setup();
    mockPickFolder.mockResolvedValue("/Users/test/Music");
    mockInvoke.mockRejectedValue("permission denied");

    render(<WelcomeScreen onComplete={onComplete} />);
    await user.click(screen.getByText("Choose Music Folder"));

    expect(await screen.findByText("Scan failed: permission denied")).toBeInTheDocument();
    expect(onComplete).not.toHaveBeenCalled();
  });
});
