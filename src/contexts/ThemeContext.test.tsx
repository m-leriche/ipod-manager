import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, act } from "@testing-library/react";

vi.unmock("./ThemeContext");
import { ThemeProvider, useTheme } from "./ThemeContext";

const ThemeDisplay = () => {
  const { theme, setTheme } = useTheme();
  return (
    <div>
      <span data-testid="theme">{theme}</span>
      <button onClick={() => setTheme("win95")}>Set Win95</button>
      <button onClick={() => setTheme("dark")}>Set Dark</button>
      <button onClick={() => setTheme("classic")}>Set Classic</button>
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
    act(() => screen.getByText("Set Win95").click());
    expect(screen.getByTestId("theme").textContent).toBe("win95");
    expect(document.documentElement.getAttribute("data-theme")).toBe("win95");
  });

  it("persists theme to localStorage", () => {
    render(
      <ThemeProvider>
        <ThemeDisplay />
      </ThemeProvider>,
    );
    act(() => screen.getByText("Set Win95").click());
    expect(localStorage.getItem("crate-theme")).toBe("win95");
  });

  it("restores theme from localStorage", () => {
    localStorage.setItem("crate-theme", "win95");
    render(
      <ThemeProvider>
        <ThemeDisplay />
      </ThemeProvider>,
    );
    expect(screen.getByTestId("theme").textContent).toBe("win95");
  });

  it("switches to classic theme", () => {
    render(
      <ThemeProvider>
        <ThemeDisplay />
      </ThemeProvider>,
    );
    act(() => screen.getByText("Set Classic").click());
    expect(screen.getByTestId("theme").textContent).toBe("classic");
    expect(document.documentElement.getAttribute("data-theme")).toBe("classic");
    expect(localStorage.getItem("crate-theme")).toBe("classic");
  });

  it("restores classic theme from localStorage", () => {
    localStorage.setItem("crate-theme", "classic");
    render(
      <ThemeProvider>
        <ThemeDisplay />
      </ThemeProvider>,
    );
    expect(screen.getByTestId("theme").textContent).toBe("classic");
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
