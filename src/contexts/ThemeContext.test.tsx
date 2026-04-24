import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, act } from "@testing-library/react";

vi.unmock("./ThemeContext");
import { ThemeProvider, useTheme } from "./ThemeContext";

const ThemeDisplay = () => {
  const { theme, setTheme } = useTheme();
  return (
    <div>
      <span data-testid="theme">{theme}</span>
      <button onClick={() => setTheme("retro")}>Set Retro</button>
      <button onClick={() => setTheme("dark")}>Set Dark</button>
    </div>
  );
};

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
});

describe("ThemeContext", () => {
  it("defaults to dark theme", () => {
    render(
      <ThemeProvider>
        <ThemeDisplay />
      </ThemeProvider>,
    );
    expect(screen.getByTestId("theme").textContent).toBe("dark");
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });

  it("switches theme and updates data-theme attribute", () => {
    render(
      <ThemeProvider>
        <ThemeDisplay />
      </ThemeProvider>,
    );
    act(() => screen.getByText("Set Retro").click());
    expect(screen.getByTestId("theme").textContent).toBe("retro");
    expect(document.documentElement.getAttribute("data-theme")).toBe("retro");
  });

  it("persists theme to localStorage", () => {
    render(
      <ThemeProvider>
        <ThemeDisplay />
      </ThemeProvider>,
    );
    act(() => screen.getByText("Set Retro").click());
    expect(localStorage.getItem("crate-theme")).toBe("retro");
  });

  it("restores theme from localStorage", () => {
    localStorage.setItem("crate-theme", "retro");
    render(
      <ThemeProvider>
        <ThemeDisplay />
      </ThemeProvider>,
    );
    expect(screen.getByTestId("theme").textContent).toBe("retro");
  });

  it("falls back to dark when localStorage has invalid value", () => {
    localStorage.setItem("crate-theme", "neon");
    render(
      <ThemeProvider>
        <ThemeDisplay />
      </ThemeProvider>,
    );
    expect(screen.getByTestId("theme").textContent).toBe("dark");
  });

  it("throws when useTheme is called outside provider", () => {
    expect(() => render(<ThemeDisplay />)).toThrow("useTheme must be used within a ThemeProvider");
  });
});
