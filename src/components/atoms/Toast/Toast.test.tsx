import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act, fireEvent } from "@testing-library/react";
import { ToastProvider, useToast } from "../../../contexts/ToastContext";
import { ToastContainer } from "./Toast";

// Unmock ToastContext for these tests since we're testing the real implementation
vi.unmock("../../../contexts/ToastContext");

const ToastTrigger = () => {
  const toast = useToast();
  return (
    <div>
      <button onClick={() => toast.success("Success message")}>Success</button>
      <button onClick={() => toast.error("Error message")}>Error</button>
      <button onClick={() => toast.info("Info message")}>Info</button>
      <button onClick={() => toast.warning("Warning message")}>Warning</button>
    </div>
  );
};

const renderWithProvider = () =>
  render(
    <ToastProvider>
      <ToastTrigger />
      <ToastContainer />
    </ToastProvider>,
  );

describe("Toast", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders a success toast when triggered", () => {
    renderWithProvider();

    act(() => {
      fireEvent.click(screen.getByText("Success"));
    });

    expect(screen.getByText("Success message")).toBeInTheDocument();
  });

  it("renders an error toast when triggered", () => {
    renderWithProvider();

    act(() => {
      fireEvent.click(screen.getByText("Error"));
    });

    expect(screen.getByText("Error message")).toBeInTheDocument();
  });

  it("renders an info toast when triggered", () => {
    renderWithProvider();

    act(() => {
      fireEvent.click(screen.getByText("Info"));
    });

    expect(screen.getByText("Info message")).toBeInTheDocument();
  });

  it("renders a warning toast when triggered", () => {
    renderWithProvider();

    act(() => {
      fireEvent.click(screen.getByText("Warning"));
    });

    expect(screen.getByText("Warning message")).toBeInTheDocument();
  });

  it("auto-dismisses success toast after 4 seconds", () => {
    renderWithProvider();

    act(() => {
      fireEvent.click(screen.getByText("Success"));
    });

    expect(screen.getByText("Success message")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(4000);
    });

    expect(screen.queryByText("Success message")).not.toBeInTheDocument();
  });

  it("auto-dismisses error toast after 8 seconds", () => {
    renderWithProvider();

    act(() => {
      fireEvent.click(screen.getByText("Error"));
    });

    expect(screen.getByText("Error message")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(4000);
    });

    expect(screen.getByText("Error message")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(4000);
    });

    expect(screen.queryByText("Error message")).not.toBeInTheDocument();
  });

  it("can show multiple toasts at once", () => {
    renderWithProvider();

    act(() => {
      fireEvent.click(screen.getByText("Success"));
      fireEvent.click(screen.getByText("Error"));
    });

    expect(screen.getByText("Success message")).toBeInTheDocument();
    expect(screen.getByText("Error message")).toBeInTheDocument();
  });

  it("renders nothing when there are no toasts", () => {
    renderWithProvider();
    expect(screen.queryByText("Success message")).not.toBeInTheDocument();
  });
});
