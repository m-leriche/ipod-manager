import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ErrorBoundary } from "./ErrorBoundary";

const ThrowingChild = ({ shouldThrow }: { shouldThrow: boolean }) => {
  if (shouldThrow) throw new Error("test explosion");
  return <div>healthy content</div>;
};

// Suppress React's noisy error boundary console output during tests
beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("ErrorBoundary", () => {
  it("renders children when there is no error", () => {
    render(
      <ErrorBoundary name="Test">
        <div>child content</div>
      </ErrorBoundary>,
    );
    expect(screen.getByText("child content")).toBeInTheDocument();
  });

  it("shows fallback UI when a child throws", () => {
    render(
      <ErrorBoundary name="Library">
        <ThrowingChild shouldThrow />
      </ErrorBoundary>,
    );
    expect(screen.getByText("Library crashed")).toBeInTheDocument();
    expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();
    expect(screen.getByText("Try Again")).toBeInTheDocument();
  });

  it("recovers when Try Again is clicked", () => {
    const { rerender } = render(
      <ErrorBoundary name="Test">
        <ThrowingChild shouldThrow />
      </ErrorBoundary>,
    );
    expect(screen.getByText("Test crashed")).toBeInTheDocument();

    // Re-render with non-throwing child, then click reset
    rerender(
      <ErrorBoundary name="Test">
        <ThrowingChild shouldThrow={false} />
      </ErrorBoundary>,
    );
    fireEvent.click(screen.getByText("Try Again"));

    expect(screen.getByText("healthy content")).toBeInTheDocument();
    expect(screen.queryByText("Test crashed")).not.toBeInTheDocument();
  });

  it("toggles error details on and off", () => {
    render(
      <ErrorBoundary name="Test">
        <ThrowingChild shouldThrow />
      </ErrorBoundary>,
    );
    expect(screen.queryByText(/test explosion/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("Details"));
    expect(screen.getByText(/test explosion/)).toBeInTheDocument();

    fireEvent.click(screen.getByText("Hide Details"));
    expect(screen.queryByText(/test explosion/)).not.toBeInTheDocument();
  });

  it("renders compact fallback when compact prop is set", () => {
    render(
      <ErrorBoundary name="Now Playing" compact>
        <ThrowingChild shouldThrow />
      </ErrorBoundary>,
    );
    expect(screen.getByText("Now Playing crashed")).toBeInTheDocument();
    expect(screen.getByText("Retry")).toBeInTheDocument();
    // Compact mode should NOT show "Try Again" or "Details" buttons
    expect(screen.queryByText("Try Again")).not.toBeInTheDocument();
    expect(screen.queryByText("Details")).not.toBeInTheDocument();
  });

  it("compact mode recovers on Retry click", () => {
    const { rerender } = render(
      <ErrorBoundary name="Bar" compact>
        <ThrowingChild shouldThrow />
      </ErrorBoundary>,
    );
    expect(screen.getByText("Bar crashed")).toBeInTheDocument();

    rerender(
      <ErrorBoundary name="Bar" compact>
        <ThrowingChild shouldThrow={false} />
      </ErrorBoundary>,
    );
    fireEvent.click(screen.getByText("Retry"));
    expect(screen.getByText("healthy content")).toBeInTheDocument();
  });

  it("logs the error to console", () => {
    render(
      <ErrorBoundary name="Widgets">
        <ThrowingChild shouldThrow />
      </ErrorBoundary>,
    );
    expect(console.error).toHaveBeenCalledWith("[ErrorBoundary:Widgets]", expect.any(Error), expect.any(String));
  });
});
