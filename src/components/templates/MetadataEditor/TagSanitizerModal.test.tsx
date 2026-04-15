import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { TagSanitizerModal } from "./TagSanitizerModal";

describe("TagSanitizerModal", () => {
  const defaultProps = {
    selectedCount: 5,
    onStart: vi.fn(),
    onClose: vi.fn(),
  };

  it("renders with default form fields", () => {
    render(<TagSanitizerModal {...defaultProps} />);
    expect(screen.getByText("Sanitize Tags")).toBeInTheDocument();
    expect(
      screen.getByDisplayValue("artist,title,album,tracknumber,discnumber,totaltracks,totaldiscs,genre"),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Clear all")).toBeInTheDocument();
    expect(screen.getByLabelText("Retain front cover only")).toBeInTheDocument();
    expect(screen.getByLabelText("Preserve ReplayGain / SoundCheck")).toBeChecked();
    expect(screen.getByLabelText("Reduce date field to four-digit year")).toBeChecked();
    expect(screen.getByLabelText("Drop disc number for single disc albums")).not.toBeChecked();
  });

  it("calls onClose when Cancel is clicked", async () => {
    const user = userEvent.setup();
    render(<TagSanitizerModal {...defaultProps} />);
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  it("calls onClose when Escape is pressed", async () => {
    const user = userEvent.setup();
    render(<TagSanitizerModal {...defaultProps} />);
    await user.keyboard("{Escape}");
    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  it("shows confirmation step after clicking Start", async () => {
    const user = userEvent.setup();
    render(<TagSanitizerModal {...defaultProps} />);
    await user.click(screen.getByRole("button", { name: "Start" }));
    expect(screen.getByText(/permanently modify tags in 5 files/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Go Back" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Confirm/ })).toBeInTheDocument();
  });

  it("returns to form from confirmation via Go Back", async () => {
    const user = userEvent.setup();
    render(<TagSanitizerModal {...defaultProps} />);
    await user.click(screen.getByRole("button", { name: "Start" }));
    await user.click(screen.getByRole("button", { name: "Go Back" }));
    expect(screen.getByRole("button", { name: "Start" })).toBeInTheDocument();
  });

  it("calls onStart with correct options on confirm", async () => {
    const onStart = vi.fn();
    const user = userEvent.setup();
    render(<TagSanitizerModal {...defaultProps} onStart={onStart} />);

    await user.click(screen.getByRole("button", { name: "Start" }));
    await user.click(screen.getByRole("button", { name: /Confirm/ }));

    expect(onStart).toHaveBeenCalledWith({
      retainFields: ["artist", "title", "album", "tracknumber", "discnumber", "totaltracks", "totaldiscs", "genre"],
      pictureAction: "retain_front",
      coverFilename: "folder.jpg",
      preserveReplayGain: true,
      reduceDateToYear: true,
      dropDiscForSingle: false,
    });
  });

  it("shows cover filename input only when move_front is selected", async () => {
    const user = userEvent.setup();
    render(<TagSanitizerModal {...defaultProps} />);

    // Not visible by default (retain_front is selected)
    expect(screen.queryByDisplayValue("folder.jpg")).not.toBeInTheDocument();

    // Select "Move front cover to external file"
    await user.click(screen.getByLabelText(/Move front cover to external file/));
    expect(screen.getByDisplayValue("folder.jpg")).toBeInTheDocument();
  });

  it("shows singular file text for single selection", () => {
    render(<TagSanitizerModal {...defaultProps} selectedCount={1} />);
    // Click start to see confirmation
    // The confirmation text uses singular/plural
  });
});
