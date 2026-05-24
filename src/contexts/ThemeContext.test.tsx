import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, act } from "@testing-library/react";

vi.unmock("./ThemeContext");
import { ThemeProvider, useTheme } from "./ThemeContext";

const ThemeDisplay = () => {
  const { theme, setTheme, customThemes, saveCustomTheme, deleteCustomTheme } = useTheme();
  return (
    <div>
      <span data-testid="theme">{theme}</span>
      <span data-testid="custom-count">{customThemes.length}</span>
      <span data-testid="custom-names">{customThemes.map((t) => t.name).join(",")}</span>
      <button onClick={() => setTheme("win95")}>Set Win95</button>
      <button onClick={() => setTheme("dark")}>Set Dark</button>
      <button onClick={() => setTheme("light")}>Set Light</button>
      <button onClick={() => setTheme("classic")}>Set Classic</button>
      <button onClick={() => setTheme("winamp")}>Set Winamp</button>
      <button onClick={() => setTheme("aqua")}>Set Aqua</button>
      <button onClick={() => setTheme("spotify")}>Set Spotify</button>
      <button
        data-testid="save-custom"
        onClick={() => {
          const id = saveCustomTheme({ name: "Night", background: "#1a1a2e", accent: "#e94560", text: "#ffffff" });
          setTheme(`custom:${id}`);
        }}
      >
        Save Custom
      </button>
      <button
        data-testid="delete-first-custom"
        onClick={() => {
          if (customThemes.length > 0) deleteCustomTheme(customThemes[0].id);
        }}
      >
        Delete First
      </button>
    </div>
  );
};

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
  // Clear any inline CSS variables from prior tests
  const style = document.documentElement.style;
  for (let i = style.length - 1; i >= 0; i--) {
    const prop = style.item(i);
    if (prop.startsWith("--color-")) style.removeProperty(prop);
  }
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

  it("switches to light theme", () => {
    render(
      <ThemeProvider>
        <ThemeDisplay />
      </ThemeProvider>,
    );
    act(() => screen.getByText("Set Light").click());
    expect(screen.getByTestId("theme").textContent).toBe("light");
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    expect(localStorage.getItem("crate-theme")).toBe("light");
  });

  it("restores light theme from localStorage", () => {
    localStorage.setItem("crate-theme", "light");
    render(
      <ThemeProvider>
        <ThemeDisplay />
      </ThemeProvider>,
    );
    expect(screen.getByTestId("theme").textContent).toBe("light");
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

  it("switches to spotify theme", () => {
    render(
      <ThemeProvider>
        <ThemeDisplay />
      </ThemeProvider>,
    );
    act(() => screen.getByText("Set Spotify").click());
    expect(screen.getByTestId("theme").textContent).toBe("spotify");
    expect(document.documentElement.getAttribute("data-theme")).toBe("spotify");
    expect(localStorage.getItem("crate-theme")).toBe("spotify");
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

  // ── Custom themes ──────────────────────────────────────────

  it("starts with no custom themes", () => {
    render(
      <ThemeProvider>
        <ThemeDisplay />
      </ThemeProvider>,
    );
    expect(screen.getByTestId("custom-count").textContent).toBe("0");
  });

  it("saves and activates a custom theme", () => {
    render(
      <ThemeProvider>
        <ThemeDisplay />
      </ThemeProvider>,
    );
    act(() => screen.getByTestId("save-custom").click());
    expect(screen.getByTestId("theme").textContent).toMatch(/^custom:/);
    expect(screen.getByTestId("custom-count").textContent).toBe("1");
    expect(screen.getByTestId("custom-names").textContent).toBe("Night");
    expect(document.documentElement.getAttribute("data-theme")).toBe("custom");
  });

  it("persists custom themes to localStorage", () => {
    render(
      <ThemeProvider>
        <ThemeDisplay />
      </ThemeProvider>,
    );
    act(() => screen.getByTestId("save-custom").click());
    const stored = JSON.parse(localStorage.getItem("crate-custom-themes") ?? "[]");
    expect(stored).toHaveLength(1);
    expect(stored[0].name).toBe("Night");
    expect(stored[0].background).toBe("#1a1a2e");
  });

  it("applies inline CSS variables for custom themes", () => {
    render(
      <ThemeProvider>
        <ThemeDisplay />
      </ThemeProvider>,
    );
    act(() => screen.getByTestId("save-custom").click());
    expect(document.documentElement.style.getPropertyValue("--color-bg-primary")).toBe("#1a1a2e");
    expect(document.documentElement.style.getPropertyValue("--color-accent")).toBe("#e94560");
    expect(document.documentElement.style.getPropertyValue("--color-text-primary")).toBe("#ffffff");
  });

  it("clears inline vars when switching from custom to builtin", () => {
    render(
      <ThemeProvider>
        <ThemeDisplay />
      </ThemeProvider>,
    );
    act(() => screen.getByTestId("save-custom").click());
    expect(document.documentElement.style.getPropertyValue("--color-bg-primary")).toBe("#1a1a2e");

    act(() => screen.getByText("Set Dark").click());
    expect(document.documentElement.style.getPropertyValue("--color-bg-primary")).toBe("");
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });

  it("deletes a custom theme and falls back to dark if active", () => {
    render(
      <ThemeProvider>
        <ThemeDisplay />
      </ThemeProvider>,
    );
    act(() => screen.getByTestId("save-custom").click());
    expect(screen.getByTestId("custom-count").textContent).toBe("1");

    act(() => screen.getByTestId("delete-first-custom").click());
    expect(screen.getByTestId("custom-count").textContent).toBe("0");
    expect(screen.getByTestId("theme").textContent).toBe("dark");
  });

  it("restores a custom theme from localStorage", () => {
    const customTheme = { id: "abc123", name: "Ocean", background: "#0a192f", accent: "#64ffda", text: "#e6f1ff" };
    localStorage.setItem("crate-custom-themes", JSON.stringify([customTheme]));
    localStorage.setItem("crate-theme", "custom:abc123");

    render(
      <ThemeProvider>
        <ThemeDisplay />
      </ThemeProvider>,
    );
    expect(screen.getByTestId("theme").textContent).toBe("custom:abc123");
    expect(screen.getByTestId("custom-count").textContent).toBe("1");
    expect(document.documentElement.getAttribute("data-theme")).toBe("custom");
    expect(document.documentElement.style.getPropertyValue("--color-bg-primary")).toBe("#0a192f");
  });

  it("falls back to dark when stored custom theme no longer exists", () => {
    localStorage.setItem("crate-theme", "custom:deleted-id");
    render(
      <ThemeProvider>
        <ThemeDisplay />
      </ThemeProvider>,
    );
    expect(screen.getByTestId("theme").textContent).toBe("dark");
  });
});
