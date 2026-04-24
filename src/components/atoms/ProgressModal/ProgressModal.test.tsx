import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { ProgressModal } from "./ProgressModal";

// Override the setup.ts mock with controllable vi.fn()
const mockCancel = vi.fn();
const mockDismiss = vi.fn();
let mockState = {
  active: false,
  title: "",
  completed: 0,
  total: 0,
  currentItem: "",
  canCancel: false,
  result: null as { success: boolean; message: string } | null,
};

vi.mock("../../../contexts/ProgressContext", () => ({
  useProgress: () => ({
    state: mockState,
    start: vi.fn(),
    update: vi.fn(),
    finish: vi.fn(),
    fail: vi.fn(),
    dismiss: mockDismiss,
    cancel: mockCancel,
  }),
}));

describe("ProgressModal", () => {
  it("renders nothing when not active", () => {
    mockState = { active: false, title: "", completed: 0, total: 0, currentItem: "", canCancel: false, result: null };
    const { container } = render(<ProgressModal />);
    expect(container.firstChild).toBeNull();
  });

  it("renders modal when active", () => {
    mockState = {
      active: true,
      title: "Scanning...",
      completed: 5,
      total: 10,
      currentItem: "song.flac",
      canCancel: false,
      result: null,
    };
    render(<ProgressModal />);
    expect(screen.getByText("Scanning...")).toBeInTheDocument();
    expect(screen.getByText("song.flac")).toBeInTheDocument();
    expect(screen.getByText("5 / 10")).toBeInTheDocument();
  });

  it("does not show cancel button when canCancel is false", () => {
    mockState = {
      active: true,
      title: "Working",
      completed: 0,
      total: 5,
      currentItem: "",
      canCancel: false,
      result: null,
    };
    render(<ProgressModal />);
    expect(screen.queryByText("Cancel")).not.toBeInTheDocument();
  });

  it("shows cancel button when canCancel is true", () => {
    mockState = {
      active: true,
      title: "Working",
      completed: 0,
      total: 5,
      currentItem: "",
      canCancel: true,
      result: null,
    };
    render(<ProgressModal />);
    expect(screen.getByText("Cancel")).toBeInTheDocument();
  });

  it("calls cancel when cancel button clicked", async () => {
    const user = userEvent.setup();
    mockState = {
      active: true,
      title: "Working",
      completed: 0,
      total: 5,
      currentItem: "",
      canCancel: true,
      result: null,
    };
    render(<ProgressModal />);
    await user.click(screen.getByText("Cancel"));
    expect(mockCancel).toHaveBeenCalledOnce();
  });

  it("shows result message when result is set", () => {
    mockState = {
      active: true,
      title: "Done",
      completed: 10,
      total: 10,
      currentItem: "",
      canCancel: false,
      result: { success: true, message: "Completed successfully" },
    };
    render(<ProgressModal />);
    expect(screen.getByText("Completed successfully")).toBeInTheDocument();
    expect(screen.getByText("OK")).toBeInTheDocument();
  });

  it("calls dismiss when OK button clicked", async () => {
    const user = userEvent.setup();
    mockState = {
      active: true,
      title: "Done",
      completed: 10,
      total: 10,
      currentItem: "",
      canCancel: false,
      result: { success: true, message: "Done" },
    };
    render(<ProgressModal />);
    await user.click(screen.getByText("OK"));
    expect(mockDismiss).toHaveBeenCalled();
  });

  it("does not show count when total is 0", () => {
    mockState = {
      active: true,
      title: "Initializing",
      completed: 0,
      total: 0,
      currentItem: "",
      canCancel: false,
      result: null,
    };
    render(<ProgressModal />);
    expect(screen.queryByText(/\//)).not.toBeInTheDocument();
  });

  it("shows error styling for failed result", () => {
    mockState = {
      active: true,
      title: "Failed",
      completed: 0,
      total: 0,
      currentItem: "",
      canCancel: false,
      result: { success: false, message: "Something went wrong" },
    };
    render(<ProgressModal />);
    const msg = screen.getByText("Something went wrong");
    expect(msg.className).toContain("text-danger");
  });
});
