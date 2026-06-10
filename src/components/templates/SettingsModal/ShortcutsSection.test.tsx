import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ShortcutsSection } from "./ShortcutsSection";
import { getBinding, DEFAULT_BINDINGS } from "../../../utils/shortcuts";

describe("ShortcutsSection", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("lists all customizable shortcuts", () => {
    render(<ShortcutsSection />);
    expect(screen.getByTestId("shortcut-playPause")).toBeInTheDocument();
    expect(screen.getByTestId("shortcut-focusSearch")).toBeInTheDocument();
    expect(screen.getByTestId("shortcut-toggleShortcutsDialog")).toBeInTheDocument();
  });

  it("enters recording mode when a shortcut is clicked", () => {
    render(<ShortcutsSection />);
    fireEvent.click(screen.getByTestId("shortcut-playPause"));
    expect(screen.getByText("Press keys…")).toBeInTheDocument();
  });

  it("records a new binding on keydown", () => {
    render(<ShortcutsSection />);
    fireEvent.click(screen.getByTestId("shortcut-playPause"));
    fireEvent.keyDown(window, { code: "KeyK" });

    expect(getBinding("playPause")).toEqual({ code: "KeyK", mod: false, shift: false, alt: false });
    expect(screen.queryByText("Press keys…")).not.toBeInTheDocument();
  });

  it("cancels recording on Escape", () => {
    render(<ShortcutsSection />);
    fireEvent.click(screen.getByTestId("shortcut-playPause"));
    fireEvent.keyDown(window, { code: "Escape" });

    expect(getBinding("playPause")).toEqual(DEFAULT_BINDINGS.playPause);
    expect(screen.queryByText("Press keys…")).not.toBeInTheDocument();
  });

  it("ignores bare modifier keys while recording", () => {
    render(<ShortcutsSection />);
    fireEvent.click(screen.getByTestId("shortcut-playPause"));
    fireEvent.keyDown(window, { code: "ShiftLeft", shiftKey: true });

    expect(screen.getByText("Press keys…")).toBeInTheDocument();
    expect(getBinding("playPause")).toEqual(DEFAULT_BINDINGS.playPause);
  });

  it("rejects a binding already used by another action", () => {
    render(<ShortcutsSection />);
    fireEvent.click(screen.getByTestId("shortcut-nextTrack"));
    // Space is the default play/pause binding
    fireEvent.keyDown(window, { code: "Space" });

    expect(screen.getByRole("alert")).toHaveTextContent("already used");
    expect(getBinding("nextTrack")).toEqual(DEFAULT_BINDINGS.nextTrack);
  });

  it("rejects fixed combos like mod+Z (undo)", () => {
    render(<ShortcutsSection />);
    fireEvent.click(screen.getByTestId("shortcut-focusSearch"));
    fireEvent.keyDown(window, { code: "KeyZ", metaKey: true });

    expect(screen.getByRole("alert")).toHaveTextContent("Undo");
    expect(getBinding("focusSearch")).toEqual(DEFAULT_BINDINGS.focusSearch);
  });

  it("shows a reset button for customized shortcuts and resets on click", () => {
    render(<ShortcutsSection />);
    fireEvent.click(screen.getByTestId("shortcut-playPause"));
    fireEvent.keyDown(window, { code: "KeyK" });

    const reset = screen.getByTestId("reset-shortcut-playPause");
    fireEvent.click(reset);

    expect(getBinding("playPause")).toEqual(DEFAULT_BINDINGS.playPause);
    expect(screen.queryByTestId("reset-shortcut-playPause")).not.toBeInTheDocument();
  });

  it("resets all shortcuts to defaults", () => {
    render(<ShortcutsSection />);
    fireEvent.click(screen.getByTestId("shortcut-playPause"));
    fireEvent.keyDown(window, { code: "KeyK" });
    fireEvent.click(screen.getByTestId("shortcut-nextTrack"));
    fireEvent.keyDown(window, { code: "KeyN" });

    fireEvent.click(screen.getByTestId("reset-all-shortcuts"));

    expect(getBinding("playPause")).toEqual(DEFAULT_BINDINGS.playPause);
    expect(getBinding("nextTrack")).toEqual(DEFAULT_BINDINGS.nextTrack);
  });

  it("clearing an override back to its default removes the customized state", () => {
    render(<ShortcutsSection />);
    fireEvent.click(screen.getByTestId("shortcut-playPause"));
    fireEvent.keyDown(window, { code: "KeyK" });
    expect(screen.getByTestId("reset-shortcut-playPause")).toBeInTheDocument();

    // Re-record the default binding — should clear the override entirely
    fireEvent.click(screen.getByTestId("shortcut-playPause"));
    fireEvent.keyDown(window, { code: "Space" });

    expect(screen.queryByTestId("reset-shortcut-playPause")).not.toBeInTheDocument();
    expect(localStorage.getItem("crate-shortcut-overrides")).toBe("{}");
  });
});
