import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";

vi.unmock("../../../contexts/ThemeContext");

let mockTheme = "dark";
vi.mock("../../../contexts/ThemeContext", () => ({
  useTheme: () => ({ theme: mockTheme, setTheme: vi.fn() }),
  ThemeProvider: ({ children }: { children: React.ReactNode }) => children,
}));

import { RetroWindowDots } from "./RetroWindowDots";

beforeEach(() => {
  mockTheme = "dark";
});

describe("RetroWindowDots", () => {
  it("renders nothing in dark theme", () => {
    mockTheme = "dark";
    const { container } = render(<RetroWindowDots />);
    expect(container.innerHTML).toBe("");
  });

  it("renders three dots in win95 theme", () => {
    mockTheme = "win95";
    const { container } = render(<RetroWindowDots />);
    const dots = container.querySelectorAll(".rounded-full");
    expect(dots).toHaveLength(3);
  });
});
