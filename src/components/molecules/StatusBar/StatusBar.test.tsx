import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { StatusBar } from "./StatusBar";

vi.mock("../../../contexts/BackgroundArtRepairContext", () => ({
  useBackgroundArtRepair: () => ({
    state: { active: false, total: 0, completed: 0, currentItem: "" },
    cancel: vi.fn(),
  }),
}));

vi.mock("../../../contexts/BackgroundLyricsContext", () => ({
  useBackgroundLyrics: () => ({
    state: { active: false, total: 0, completed: 0, currentItem: "" },
    cancel: vi.fn(),
  }),
}));

vi.mock("../../../contexts/LastfmContext", () => ({
  useLastfmState: () => ({
    connected: false,
    username: null,
    scrobbleEnabled: false,
    queueCount: 0,
    connecting: false,
  }),
}));

describe("StatusBar", () => {
  it("shows library stats when summary is provided", () => {
    render(<StatusBar librarySummary={{ trackCount: 1234, artistCount: 56, albumCount: 78 }} ipodConnected={false} />);

    expect(screen.getByText(/1,234/)).toBeInTheDocument();
    expect(screen.getByText(/tracks/)).toBeInTheDocument();
    expect(screen.getByText(/56/)).toBeInTheDocument();
    expect(screen.getByText(/artists/)).toBeInTheDocument();
    expect(screen.getByText(/78/)).toBeInTheDocument();
    expect(screen.getByText(/albums/)).toBeInTheDocument();
  });

  it("shows 'No library' when summary is null", () => {
    render(<StatusBar librarySummary={null} ipodConnected={false} />);

    expect(screen.getByText("No library")).toBeInTheDocument();
  });

  it("shows iPod indicator when connected", () => {
    render(<StatusBar librarySummary={{ trackCount: 100, artistCount: 10, albumCount: 5 }} ipodConnected={true} />);

    expect(screen.getByText("iPod")).toBeInTheDocument();
  });

  it("hides iPod indicator when not connected", () => {
    render(<StatusBar librarySummary={{ trackCount: 100, artistCount: 10, albumCount: 5 }} ipodConnected={false} />);

    expect(screen.queryByText("iPod")).not.toBeInTheDocument();
  });

  it("uses singular labels for count of 1", () => {
    render(<StatusBar librarySummary={{ trackCount: 1, artistCount: 1, albumCount: 1 }} ipodConnected={false} />);

    expect(screen.getByText(/1 track\b/)).toBeInTheDocument();
    expect(screen.getByText(/1 artist\b/)).toBeInTheDocument();
    expect(screen.getByText(/1 album\b/)).toBeInTheDocument();
  });
});
