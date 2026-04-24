import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { StorageBar } from "./StorageBar";

describe("StorageBar", () => {
  it("renders null when totalSpace is 0", () => {
    const { container } = render(<StorageBar audioSpace={0} otherSpace={0} freeSpace={0} totalSpace={0} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders storage label and total", () => {
    render(
      <StorageBar
        audioSpace={50_000_000_000}
        otherSpace={10_000_000_000}
        freeSpace={60_000_000_000}
        totalSpace={120_000_000_000}
      />,
    );
    expect(screen.getByText("Storage")).toBeInTheDocument();
    expect(screen.getByText("111.8 GB total")).toBeInTheDocument();
  });

  it("renders all three legend items", () => {
    render(
      <StorageBar
        audioSpace={50_000_000_000}
        otherSpace={10_000_000_000}
        freeSpace={60_000_000_000}
        totalSpace={120_000_000_000}
      />,
    );
    expect(screen.getByText(/Audio/)).toBeInTheDocument();
    expect(screen.getByText(/Other/)).toBeInTheDocument();
    expect(screen.getByText(/Free/)).toBeInTheDocument();
  });

  it("renders correct byte values in legend", () => {
    render(
      <StorageBar
        audioSpace={45_000_000_000}
        otherSpace={14_100_000_000}
        freeSpace={60_000_000_000}
        totalSpace={119_100_000_000}
      />,
    );
    expect(screen.getByText("41.9 GB")).toBeInTheDocument();
    expect(screen.getByText("13.1 GB")).toBeInTheDocument();
    expect(screen.getByText("55.9 GB")).toBeInTheDocument();
  });

  it("handles all space used (free = 0)", () => {
    render(
      <StorageBar
        audioSpace={100_000_000_000}
        otherSpace={20_000_000_000}
        freeSpace={0}
        totalSpace={120_000_000_000}
      />,
    );
    expect(screen.getByText(/Audio/)).toBeInTheDocument();
    expect(screen.getByText(/Free/)).toBeInTheDocument();
  });

  it("handles all space free (no audio, no other)", () => {
    render(<StorageBar audioSpace={0} otherSpace={0} freeSpace={120_000_000_000} totalSpace={120_000_000_000} />);
    // Both Audio and Other show "0 B"
    expect(screen.getAllByText("0 B")).toHaveLength(2);
    expect(screen.getByText("111.8 GB")).toBeInTheDocument(); // Free space value
  });
});
