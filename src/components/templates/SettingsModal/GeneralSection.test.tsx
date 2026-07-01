import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { invoke } from "@tauri-apps/api/core";
import { GeneralSection } from "./GeneralSection";
import { getSetting } from "../../../utils/settings";

describe("GeneralSection", () => {
  const onLibraryChanged = vi.fn();
  const onReplayTour = vi.fn();

  beforeEach(() => {
    localStorage.clear();
    onReplayTour.mockClear();
    vi.mocked(invoke).mockImplementation(async (cmd: string) => {
      if (cmd === "get_library_location") return "/Users/test/Music";
      return undefined;
    });
  });

  it("displays the library location", async () => {
    render(<GeneralSection onLibraryChanged={onLibraryChanged} onReplayTour={onReplayTour} />);
    await waitFor(() => {
      expect(screen.getByText("/Users/test/Music")).toBeInTheDocument();
    });
  });

  it("renders startup toggles with their defaults", () => {
    render(<GeneralSection onLibraryChanged={onLibraryChanged} onReplayTour={onReplayTour} />);
    expect((screen.getByTestId("resume-queue-toggle") as HTMLInputElement).checked).toBe(true);
    expect((screen.getByTestId("remember-tab-toggle") as HTMLInputElement).checked).toBe(false);
  });

  it("persists resume-queue preference when toggled", () => {
    render(<GeneralSection onLibraryChanged={onLibraryChanged} onReplayTour={onReplayTour} />);
    fireEvent.click(screen.getByTestId("resume-queue-toggle"));
    expect(getSetting("resumeQueueOnLaunch")).toBe(false);
    expect((screen.getByTestId("resume-queue-toggle") as HTMLInputElement).checked).toBe(false);
  });

  it("persists remember-last-tab preference when toggled", () => {
    render(<GeneralSection onLibraryChanged={onLibraryChanged} onReplayTour={onReplayTour} />);
    fireEvent.click(screen.getByTestId("remember-tab-toggle"));
    expect(getSetting("rememberLastTab")).toBe(true);
  });

  it("reflects previously saved startup preferences", () => {
    localStorage.setItem("crate-resume-queue-on-launch", "false");
    localStorage.setItem("crate-remember-last-tab", "true");
    render(<GeneralSection onLibraryChanged={onLibraryChanged} onReplayTour={onReplayTour} />);
    expect((screen.getByTestId("resume-queue-toggle") as HTMLInputElement).checked).toBe(false);
    expect((screen.getByTestId("remember-tab-toggle") as HTMLInputElement).checked).toBe(true);
  });

  it("invokes onReplayTour when the replay button is clicked", () => {
    render(<GeneralSection onLibraryChanged={onLibraryChanged} onReplayTour={onReplayTour} />);
    fireEvent.click(screen.getByTestId("replay-tour-button"));
    expect(onReplayTour).toHaveBeenCalledOnce();
  });
});
