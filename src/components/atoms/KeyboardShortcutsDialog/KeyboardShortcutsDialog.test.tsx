import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { KeyboardShortcutsDialog } from "./KeyboardShortcutsDialog";
import { SHORTCUT_DEFS } from "../../../utils/shortcuts";

describe("KeyboardShortcutsDialog", () => {
  const onClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it("lists every registry action by label", () => {
    render(<KeyboardShortcutsDialog onClose={onClose} />);
    for (const def of SHORTCUT_DEFS) {
      expect(screen.getByText(def.label)).toBeInTheDocument();
    }
  });

  it("shows the Playback, Navigation, Library, and General sections", () => {
    render(<KeyboardShortcutsDialog onClose={onClose} />);
    for (const title of ["Playback", "Navigation", "Library", "General"]) {
      expect(screen.getByRole("heading", { name: title })).toBeInTheDocument();
    }
  });

  it("keeps the fixed list-navigation entries", () => {
    render(<KeyboardShortcutsDialog onClose={onClose} />);
    expect(screen.getByText("Navigate tracks")).toBeInTheDocument();
    expect(screen.getByText("Jump to matching track")).toBeInTheDocument();
  });

  it("reflects a rebound shortcut", () => {
    localStorage.setItem(
      "crate-shortcut-overrides",
      JSON.stringify({ toggleQueuePanel: { code: "KeyU", mod: true, shift: false, alt: false } }),
    );
    render(<KeyboardShortcutsDialog onClose={onClose} />);
    const row = screen.getByText("Toggle queue panel").closest("div");
    expect(row).toHaveTextContent("U");
  });

  it("closes on Escape", () => {
    render(<KeyboardShortcutsDialog onClose={onClose} />);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
