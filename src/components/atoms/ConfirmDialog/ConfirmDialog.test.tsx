import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { ConfirmDialog } from "./ConfirmDialog";

describe("ConfirmDialog", () => {
  const defaults = {
    title: "Delete",
    message: "Are you sure?",
    onConfirm: vi.fn(),
    onCancel: vi.fn(),
  };

  it("renders title and message", () => {
    render(<ConfirmDialog {...defaults} />);
    expect(screen.getByText("Delete")).toBeInTheDocument();
    expect(screen.getByText("Are you sure?")).toBeInTheDocument();
  });

  it("calls onConfirm when confirm button is clicked", () => {
    render(<ConfirmDialog {...defaults} confirmLabel="Yes" />);
    fireEvent.click(screen.getByText("Yes"));
    expect(defaults.onConfirm).toHaveBeenCalledOnce();
  });

  it("calls onCancel when cancel button is clicked", () => {
    render(<ConfirmDialog {...defaults} />);
    fireEvent.click(screen.getByText("Cancel"));
    expect(defaults.onCancel).toHaveBeenCalledOnce();
  });

  it("calls onCancel on Escape key", () => {
    render(<ConfirmDialog {...defaults} />);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(defaults.onCancel).toHaveBeenCalledOnce();
  });

  it("calls onCancel when clicking backdrop", () => {
    const { container } = render(<ConfirmDialog {...defaults} />);
    const backdrop = container.querySelector(".bg-black\\/50");
    fireEvent.click(backdrop!);
    expect(defaults.onCancel).toHaveBeenCalledOnce();
  });

  it("uses default button labels", () => {
    render(<ConfirmDialog {...defaults} />);
    expect(screen.getByText("OK")).toBeInTheDocument();
    expect(screen.getByText("Cancel")).toBeInTheDocument();
  });

  it("applies danger styling when danger prop is true", () => {
    render(<ConfirmDialog {...defaults} danger confirmLabel="Delete" />);
    const btn = screen.getByRole("button", { name: "Delete" });
    expect(btn.className).toContain("bg-danger");
  });
});
