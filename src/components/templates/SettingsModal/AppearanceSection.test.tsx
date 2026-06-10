import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ThemeProvider } from "../../../contexts/ThemeContext";
import { AppearanceSection } from "./AppearanceSection";

const renderSection = () =>
  render(
    <ThemeProvider>
      <AppearanceSection />
    </ThemeProvider>,
  );

describe("AppearanceSection", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("renders all builtin themes", () => {
    renderSection();
    for (const label of ["Dark", "Light", "Windows 95", "Classic", "Winamp", "Aqua", "Spotify"]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it("shows the create theme button", () => {
    renderSection();
    expect(screen.getByTestId("create-theme-btn")).toBeInTheDocument();
  });

  it("opens the custom theme editor when create is clicked", () => {
    renderSection();
    fireEvent.click(screen.getByTestId("create-theme-btn"));
    expect(screen.queryByTestId("create-theme-btn")).not.toBeInTheDocument();
  });
});
