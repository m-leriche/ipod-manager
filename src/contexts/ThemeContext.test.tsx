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
      <button onClick={() => setTheme("winamp")}>Set Winamp</button>
      <button onClick={() => setTheme("gameboy")}>Set GameBoy</button>
      <button onClick={() => setTheme("aqua")}>Set Aqua</button>
      <button onClick={() => setTheme("msdos")}>Set MSDOS</button>
      <button onClick={() => setTheme("terminal")}>Set Terminal</button>
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

  it("switches to winamp theme", () => {
    render(
      <ThemeProvider>
        <ThemeDisplay />
      </ThemeProvider>,
    );
    act(() => screen.getByText("Set Winamp").click());
    expect(screen.getByTestId("theme").textContent).toBe("winamp");
    expect(document.documentElement.getAttribute("data-theme")).toBe("winamp");
    expect(localStorage.getItem("crate-theme")).toBe("winamp");
  });

  it("restores winamp theme from localStorage", () => {
    localStorage.setItem("crate-theme", "winamp");
    render(
      <ThemeProvider>
        <ThemeDisplay />
      </ThemeProvider>,
    );
    expect(screen.getByTestId("theme").textContent).toBe("winamp");
  });

  it("switches to gameboy theme", () => {
    render(
      <ThemeProvider>
        <ThemeDisplay />
      </ThemeProvider>,
    );
    act(() => screen.getByText("Set GameBoy").click());
    expect(screen.getByTestId("theme").textContent).toBe("gameboy");
    expect(document.documentElement.getAttribute("data-theme")).toBe("gameboy");
    expect(localStorage.getItem("crate-theme")).toBe("gameboy");
  });

  it("switches to aqua theme", () => {
    render(
      <ThemeProvider>
        <ThemeDisplay />
      </ThemeProvider>,
    );
    act(() => screen.getByText("Set Aqua").click());
    expect(screen.getByTestId("theme").textContent).toBe("aqua");
    expect(document.documentElement.getAttribute("data-theme")).toBe("aqua");
    expect(localStorage.getItem("crate-theme")).toBe("aqua");
  });

  it("switches to msdos theme", () => {
    render(
      <ThemeProvider>
        <ThemeDisplay />
      </ThemeProvider>,
    );
    act(() => screen.getByText("Set MSDOS").click());
    expect(screen.getByTestId("theme").textContent).toBe("msdos");
    expect(document.documentElement.getAttribute("data-theme")).toBe("msdos");
    expect(localStorage.getItem("crate-theme")).toBe("msdos");
  });

  it("switches to terminal theme", () => {
    render(
      <ThemeProvider>
        <ThemeDisplay />
      </ThemeProvider>,
    );
    act(() => screen.getByText("Set Terminal").click());
    expect(screen.getByTestId("theme").textContent).toBe("terminal");
    expect(document.documentElement.getAttribute("data-theme")).toBe("terminal");
    expect(localStorage.getItem("crate-theme")).toBe("terminal");
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
