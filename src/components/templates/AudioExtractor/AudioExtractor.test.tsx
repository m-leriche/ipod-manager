import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("../YouTubeDownloader/YouTubeDownloader", () => ({
  YouTubeDownloader: () => <div data-testid="youtube-downloader" />,
}));
vi.mock("../VideoExtractor/VideoExtractor", () => ({
  VideoExtractor: () => <div data-testid="video-extractor" />,
}));

import { AudioExtractor } from "./AudioExtractor";

describe("AudioExtractor", () => {
  it("renders YouTube tab active by default", () => {
    render(<AudioExtractor />);

    expect(screen.getByTestId("youtube-downloader")).toBeInTheDocument();
    expect(screen.queryByTestId("video-extractor")).not.toBeInTheDocument();
  });

  it("clicking 'Local Video' switches to video tab", async () => {
    const user = userEvent.setup();
    render(<AudioExtractor />);

    await user.click(screen.getByText("Local Video"));

    expect(screen.getByTestId("video-extractor")).toBeInTheDocument();
    expect(screen.queryByTestId("youtube-downloader")).not.toBeInTheDocument();
  });

  it("clicking 'YouTube' switches back", async () => {
    const user = userEvent.setup();
    render(<AudioExtractor />);

    await user.click(screen.getByText("Local Video"));
    expect(screen.getByTestId("video-extractor")).toBeInTheDocument();

    await user.click(screen.getByText("YouTube"));
    expect(screen.getByTestId("youtube-downloader")).toBeInTheDocument();
    expect(screen.queryByTestId("video-extractor")).not.toBeInTheDocument();
  });
});
