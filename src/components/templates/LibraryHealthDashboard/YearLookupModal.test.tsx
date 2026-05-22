import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { YearLookupModal } from "./YearLookupModal";
import type { AlbumYearResult } from "./types";

const RESULTS: AlbumYearResult[] = [
  { artist: "The Beatles", album: "Abbey Road", suggested_year: 1969, release_title: "Abbey Road" },
  { artist: "Pink Floyd", album: "The Wall", suggested_year: 1979, release_title: "The Wall" },
  { artist: "Unknown", album: "No Match", suggested_year: null, release_title: null },
];

describe("YearLookupModal", () => {
  it("renders results with checkboxes checked by default", () => {
    render(<YearLookupModal results={RESULTS} onApply={vi.fn()} onCancel={vi.fn()} />);

    expect(screen.getByText("1969")).toBeInTheDocument();
    expect(screen.getByText("1979")).toBeInTheDocument();
    expect(screen.getByText("2 of 2 albums selected")).toBeInTheDocument();
  });

  it("shows no-results section for albums without suggested year", () => {
    render(<YearLookupModal results={RESULTS} onApply={vi.fn()} onCancel={vi.fn()} />);

    expect(screen.getByText("No results (1)")).toBeInTheDocument();
    expect(screen.getByText("Unknown — No Match")).toBeInTheDocument();
  });

  it("toggles album selection on row click", async () => {
    const user = userEvent.setup();
    render(<YearLookupModal results={RESULTS} onApply={vi.fn()} onCancel={vi.fn()} />);

    expect(screen.getByText("2 of 2 albums selected")).toBeInTheDocument();

    await user.click(screen.getByText("1969"));

    expect(screen.getByText("1 of 2 albums selected")).toBeInTheDocument();
  });

  it("calls onApply with only checked albums", async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    render(<YearLookupModal results={RESULTS} onApply={onApply} onCancel={vi.fn()} />);

    // Uncheck Beatles
    await user.click(screen.getByText("1969"));

    await user.click(screen.getByText(/^Apply/));

    expect(onApply).toHaveBeenCalledWith([
      { artist: "Pink Floyd", album: "The Wall", suggested_year: 1979, release_title: "The Wall" },
    ]);
  });

  it("calls onCancel when Cancel is clicked", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    render(<YearLookupModal results={RESULTS} onApply={vi.fn()} onCancel={onCancel} />);

    await user.click(screen.getByText("Cancel"));

    expect(onCancel).toHaveBeenCalled();
  });

  it("disables Apply when no albums are selected", async () => {
    const user = userEvent.setup();
    const onlyOne: AlbumYearResult[] = [
      { artist: "The Beatles", album: "Abbey Road", suggested_year: 1969, release_title: "Abbey Road" },
    ];
    render(<YearLookupModal results={onlyOne} onApply={vi.fn()} onCancel={vi.fn()} />);

    await user.click(screen.getByText("1969"));

    expect(screen.getByText("0 of 1 album selected")).toBeInTheDocument();
    expect(screen.getByText(/^Apply/).closest("button")).toBeDisabled();
  });
});
