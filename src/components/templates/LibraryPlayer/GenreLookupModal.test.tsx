import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { GenreLookupModal } from "./GenreLookupModal";
import type { GenreLookupOutcome } from "./types";

const OUTCOME: GenreLookupOutcome = {
  results: [
    {
      artist: "Nirvana",
      album: "Nevermind",
      current_genre: "Rock",
      suggested_genres: "Grunge; Rock; Alternative",
      source: "lastfm_album",
    },
    {
      artist: "Boards of Canada",
      album: "Geogaddi",
      current_genre: null,
      suggested_genres: "Ambient; IDM",
      source: "lastfm_artist",
    },
    {
      artist: "Unknown",
      album: "No Match",
      current_genre: "Folk",
      suggested_genres: null,
      source: null,
    },
  ],
  cancelled: false,
};

describe("GenreLookupModal", () => {
  it("renders suggestions with checkboxes checked by default", () => {
    render(<GenreLookupModal outcome={OUTCOME} onApply={vi.fn()} onCancel={vi.fn()} />);

    expect(screen.getByDisplayValue("Grunge; Rock; Alternative")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Ambient; IDM")).toBeInTheDocument();
    expect(screen.getByText("2 of 2 albums selected")).toBeInTheDocument();
  });

  it("shows current genre and source per row", () => {
    render(<GenreLookupModal outcome={OUTCOME} onApply={vi.fn()} onCancel={vi.fn()} />);

    expect(screen.getByText("Rock")).toBeInTheDocument();
    expect(screen.getByText("Last.fm")).toBeInTheDocument();
    expect(screen.getByText("Last.fm artist")).toBeInTheDocument();
  });

  it("shows no-results section with current genre kept", () => {
    render(<GenreLookupModal outcome={OUTCOME} onApply={vi.fn()} onCancel={vi.fn()} />);

    expect(screen.getByText("No results (1) — current genre kept")).toBeInTheDocument();
    expect(screen.getByText("Unknown — No Match (current: Folk)")).toBeInTheDocument();
  });

  it("toggles album selection on row click", async () => {
    const user = userEvent.setup();
    render(<GenreLookupModal outcome={OUTCOME} onApply={vi.fn()} onCancel={vi.fn()} />);

    await user.click(screen.getByText("Nirvana"));

    expect(screen.getByText("1 of 2 albums selected")).toBeInTheDocument();
  });

  it("calls onApply with checked albums and edited suggestions", async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    render(<GenreLookupModal outcome={OUTCOME} onApply={onApply} onCancel={vi.fn()} />);

    // Uncheck Boards of Canada, edit Nirvana's suggestion
    await user.click(screen.getByText("Boards of Canada"));
    const input = screen.getByDisplayValue("Grunge; Rock; Alternative");
    await user.clear(input);
    await user.type(input, "Grunge");

    await user.click(screen.getByText(/^Apply/));

    expect(onApply).toHaveBeenCalledWith([{ result: OUTCOME.results[0], genre: "Grunge" }]);
  });

  it("excludes albums whose suggestion was cleared to empty", async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    render(<GenreLookupModal outcome={OUTCOME} onApply={onApply} onCancel={vi.fn()} />);

    await user.clear(screen.getByDisplayValue("Grunge; Rock; Alternative"));
    await user.click(screen.getByText(/^Apply/));

    expect(onApply).toHaveBeenCalledWith([{ result: OUTCOME.results[1], genre: "Ambient; IDM" }]);
  });

  it("does not toggle selection when clicking the suggestion input", async () => {
    const user = userEvent.setup();
    render(<GenreLookupModal outcome={OUTCOME} onApply={vi.fn()} onCancel={vi.fn()} />);

    await user.click(screen.getByDisplayValue("Grunge; Rock; Alternative"));

    expect(screen.getByText("2 of 2 albums selected")).toBeInTheDocument();
  });

  it("shows a cancelled banner for partial results", () => {
    render(<GenreLookupModal outcome={{ ...OUTCOME, cancelled: true }} onApply={vi.fn()} onCancel={vi.fn()} />);

    expect(screen.getByText("Lookup cancelled — showing partial results")).toBeInTheDocument();
  });

  it("disables Apply when nothing is selected", async () => {
    const user = userEvent.setup();
    const single: GenreLookupOutcome = { results: [OUTCOME.results[0]], cancelled: false };
    render(<GenreLookupModal outcome={single} onApply={vi.fn()} onCancel={vi.fn()} />);

    await user.click(screen.getByText("Nirvana"));

    expect(screen.getByText(/^Apply/).closest("button")).toBeDisabled();
  });

  it("calls onCancel when Cancel is clicked", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    render(<GenreLookupModal outcome={OUTCOME} onApply={vi.fn()} onCancel={onCancel} />);

    await user.click(screen.getByText("Cancel"));

    expect(onCancel).toHaveBeenCalled();
  });
});
