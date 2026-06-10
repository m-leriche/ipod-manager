import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { FindReplaceModal } from "./FindReplaceModal";
import type { TrackMetadata } from "../../../types/metadata";

const tracks: TrackMetadata[] = [
  {
    file_path: "/music/a.mp3",
    file_name: "a.mp3",
    title: "Song (Live)",
    artist: "Artist",
    album: "Album (Live)",
    album_artist: null,
    sort_artist: null,
    sort_album_artist: null,
    track: 1,
    track_total: null,
    disc_number: null,
    disc_total: null,
    year: null,
    genre: null,
  },
];

const renderModal = (onApply = vi.fn(), onClose = vi.fn()) => {
  render(
    <FindReplaceModal
      tracks={tracks}
      editedTracks={{}}
      targetLabel="1 selected track"
      onApply={onApply}
      onClose={onClose}
    />,
  );
  return { onApply, onClose };
};

describe("FindReplaceModal", () => {
  it("renders with the target label", () => {
    renderModal();
    expect(screen.getByText(/1 selected track/)).toBeInTheDocument();
  });

  it("disables apply until there are changes", () => {
    renderModal();
    expect(screen.getByTestId("apply-find-replace")).toBeDisabled();
  });

  it("previews matches as you type", () => {
    renderModal();
    fireEvent.change(screen.getByTestId("find-input"), { target: { value: " (Live)" } });

    expect(screen.getByTestId("find-replace-preview")).toBeInTheDocument();
    expect(screen.getByText("1 change")).toBeInTheDocument();
    expect(screen.getByText("Song (Live)")).toBeInTheDocument();
  });

  it("includes additional fields when toggled", () => {
    renderModal();
    fireEvent.change(screen.getByTestId("find-input"), { target: { value: " (Live)" } });
    fireEvent.click(screen.getByTestId("field-toggle-album"));

    expect(screen.getByText("2 changes")).toBeInTheDocument();
  });

  it("shows an error for an invalid regex", () => {
    renderModal();
    fireEvent.click(screen.getByTestId("regex-toggle"));
    fireEvent.change(screen.getByTestId("find-input"), { target: { value: "[unclosed" } });

    expect(screen.getByRole("alert")).toHaveTextContent("Invalid regular expression");
    expect(screen.getByTestId("apply-find-replace")).toBeDisabled();
  });

  it("shows a no-matches message", () => {
    renderModal();
    fireEvent.change(screen.getByTestId("find-input"), { target: { value: "zzz-no-match" } });
    expect(screen.getByText("No matches in the selected fields")).toBeInTheDocument();
  });

  it("calls onApply with the computed changes", () => {
    const { onApply } = renderModal();
    fireEvent.change(screen.getByTestId("find-input"), { target: { value: " (Live)" } });
    fireEvent.click(screen.getByTestId("apply-find-replace"));

    expect(onApply).toHaveBeenCalledTimes(1);
    const changes = onApply.mock.calls[0][0];
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ filePath: "/music/a.mp3", field: "title", after: "Song" });
  });

  it("closes on Escape", () => {
    const onClose = vi.fn();
    renderModal(vi.fn(), onClose);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  it("closes on backdrop click", () => {
    const onClose = vi.fn();
    renderModal(vi.fn(), onClose);
    fireEvent.click(screen.getByTestId("find-replace-backdrop"));
    expect(onClose).toHaveBeenCalled();
  });
});
