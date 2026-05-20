import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { SyncActions } from "./SyncActions";

const defaultProps = {
  syncing: false,
  progress: null,
  result: null,
  nSrc: 2,
  nTgt: 3,
  nMirror: 5,
  onMirrorToTarget: vi.fn(),
  onCopyToTarget: vi.fn(),
  onCopyToSource: vi.fn(),
  onDeleteTarget: vi.fn(),
  onCancel: vi.fn(),
};

describe("SyncActions", () => {
  it("shows confirmation dialog when Delete is clicked", async () => {
    const user = userEvent.setup();
    render(<SyncActions {...defaultProps} />);

    await user.click(screen.getByRole("button", { name: /Delete 3/ }));

    expect(screen.getByText("Delete Files")).toBeInTheDocument();
    expect(screen.getByText(/permanently delete 3 files/)).toBeInTheDocument();
  });

  it("does not call onDeleteTarget until confirmed", async () => {
    const user = userEvent.setup();
    const onDeleteTarget = vi.fn();
    render(<SyncActions {...defaultProps} onDeleteTarget={onDeleteTarget} />);

    await user.click(screen.getByRole("button", { name: /Delete 3/ }));
    expect(onDeleteTarget).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Delete" }));
    expect(onDeleteTarget).toHaveBeenCalledOnce();
  });

  it("does not call onDeleteTarget when cancel is clicked", async () => {
    const user = userEvent.setup();
    const onDeleteTarget = vi.fn();
    render(<SyncActions {...defaultProps} onDeleteTarget={onDeleteTarget} />);

    await user.click(screen.getByRole("button", { name: /Delete 3/ }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onDeleteTarget).not.toHaveBeenCalled();
    expect(screen.queryByText("Delete Files")).not.toBeInTheDocument();
  });

  it("shows confirmation dialog when Mirror is clicked", async () => {
    const user = userEvent.setup();
    render(<SyncActions {...defaultProps} />);

    await user.click(screen.getByRole("button", { name: /Mirror 5 to iPod/ }));

    expect(screen.getByText("Mirror to iPod")).toBeInTheDocument();
    expect(screen.getByText(/sync 5 files/)).toBeInTheDocument();
  });

  it("does not call onMirrorToTarget until confirmed", async () => {
    const user = userEvent.setup();
    const onMirrorToTarget = vi.fn();
    render(<SyncActions {...defaultProps} onMirrorToTarget={onMirrorToTarget} />);

    await user.click(screen.getByRole("button", { name: /Mirror 5 to iPod/ }));
    expect(onMirrorToTarget).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Mirror" }));
    expect(onMirrorToTarget).toHaveBeenCalledOnce();
  });

  it("does not call onMirrorToTarget when cancel is clicked", async () => {
    const user = userEvent.setup();
    const onMirrorToTarget = vi.fn();
    render(<SyncActions {...defaultProps} onMirrorToTarget={onMirrorToTarget} />);

    await user.click(screen.getByRole("button", { name: /Mirror 5 to iPod/ }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onMirrorToTarget).not.toHaveBeenCalled();
    expect(screen.queryByText("Mirror to iPod")).not.toBeInTheDocument();
  });
});
