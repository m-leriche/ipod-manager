import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useSelectionShortcuts } from "./useSelectionShortcuts";
import type { LibraryTrack } from "../../../types/library";

const makeTrack = (id: number, flagged = false) => ({ id, flagged }) as LibraryTrack;

const keydown = (code: string, opts: { meta?: boolean; alt?: boolean } = {}) => {
  window.dispatchEvent(
    new KeyboardEvent("keydown", { code, metaKey: opts.meta ?? false, altKey: opts.alt ?? false, bubbles: true }),
  );
};

describe("useSelectionShortcuts", () => {
  const onRateTracks = vi.fn();
  const onFlagTracks = vi.fn();

  const renderShortcuts = (selectedTracks: LibraryTrack[], enabled = true) =>
    renderHook(
      (props: { enabled: boolean; selectedTracks: LibraryTrack[] }) =>
        useSelectionShortcuts({ ...props, onRateTracks, onFlagTracks }),
      { initialProps: { enabled, selectedTracks } },
    );

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it("rates the selection when a digit key 1-5 is pressed", () => {
    renderShortcuts([makeTrack(1), makeTrack(2)]);
    keydown("Digit3");
    expect(onRateTracks).toHaveBeenCalledWith([1, 2], 3);
  });

  it("rates 1 and 5 stars at the range edges", () => {
    renderShortcuts([makeTrack(7)]);
    keydown("Digit1");
    expect(onRateTracks).toHaveBeenCalledWith([7], 1);
    keydown("Digit5");
    expect(onRateTracks).toHaveBeenCalledWith([7], 5);
  });

  it("clears the rating on 0", () => {
    renderShortcuts([makeTrack(1)]);
    keydown("Digit0");
    expect(onRateTracks).toHaveBeenCalledWith([1], 0);
  });

  it("flags the selection on L when not all tracks are flagged", () => {
    renderShortcuts([makeTrack(1, true), makeTrack(2, false)]);
    keydown("KeyL");
    expect(onFlagTracks).toHaveBeenCalledWith([1, 2], true);
  });

  it("unflags the selection on L when all tracks are flagged", () => {
    renderShortcuts([makeTrack(1, true), makeTrack(2, true)]);
    keydown("KeyL");
    expect(onFlagTracks).toHaveBeenCalledWith([1, 2], false);
  });

  it("does nothing without a selection", () => {
    renderShortcuts([]);
    keydown("Digit3");
    keydown("KeyL");
    expect(onRateTracks).not.toHaveBeenCalled();
    expect(onFlagTracks).not.toHaveBeenCalled();
  });

  it("does nothing while disabled (library tab inactive)", () => {
    renderShortcuts([makeTrack(1)], false);
    keydown("Digit3");
    expect(onRateTracks).not.toHaveBeenCalled();
  });

  it("ignores digits with modifiers (tab switching / view modes)", () => {
    renderShortcuts([makeTrack(1)]);
    keydown("Digit3", { meta: true });
    keydown("Digit3", { alt: true });
    expect(onRateTracks).not.toHaveBeenCalled();
  });

  it("does not fire while typing in an input", () => {
    renderShortcuts([makeTrack(1)]);
    const input = document.createElement("input");
    document.body.append(input);
    input.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit3", bubbles: true }));
    expect(onRateTracks).not.toHaveBeenCalled();
    input.remove();
  });

  it("sees the latest selection without re-registering", () => {
    const { rerender } = renderShortcuts([makeTrack(1)]);
    rerender({ enabled: true, selectedTracks: [makeTrack(9)] });
    keydown("Digit2");
    expect(onRateTracks).toHaveBeenCalledWith([9], 2);
  });

  it("respects a rebound rating shortcut", () => {
    localStorage.setItem(
      "crate-shortcut-overrides",
      JSON.stringify({ rateTracks1: { code: "KeyR", mod: false, shift: false, alt: false } }),
    );
    renderShortcuts([makeTrack(1)]);
    keydown("Digit1");
    expect(onRateTracks).not.toHaveBeenCalled();
    keydown("KeyR");
    expect(onRateTracks).toHaveBeenCalledWith([1], 1);
  });
});
