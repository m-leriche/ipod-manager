import { describe, it, expect, beforeEach } from "vitest";
import {
  DEFAULT_BINDINGS,
  SHORTCUT_DEFS,
  getBinding,
  setBindingOverride,
  resetAllBindings,
  matchesShortcut,
  eventToBinding,
  formatBinding,
  findConflict,
  bindingsEqual,
} from "./shortcuts";

const keyEvent = (code: string, opts: { meta?: boolean; ctrl?: boolean; shift?: boolean; alt?: boolean } = {}) =>
  new KeyboardEvent("keydown", {
    code,
    metaKey: opts.meta ?? false,
    ctrlKey: opts.ctrl ?? false,
    shiftKey: opts.shift ?? false,
    altKey: opts.alt ?? false,
  });

describe("shortcuts", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe("getBinding", () => {
    it("returns defaults when no overrides exist", () => {
      expect(getBinding("playPause")).toEqual(DEFAULT_BINDINGS.playPause);
      expect(getBinding("focusSearch")).toEqual(DEFAULT_BINDINGS.focusSearch);
    });

    it("returns the override when one is set", () => {
      setBindingOverride("playPause", { code: "KeyP", mod: true, shift: false, alt: false });
      expect(getBinding("playPause")).toEqual({ code: "KeyP", mod: true, shift: false, alt: false });
    });

    it("falls back to default after clearing an override", () => {
      setBindingOverride("playPause", { code: "KeyP", mod: true, shift: false, alt: false });
      setBindingOverride("playPause", null);
      expect(getBinding("playPause")).toEqual(DEFAULT_BINDINGS.playPause);
    });

    it("only affects the overridden action", () => {
      setBindingOverride("nextTrack", { code: "KeyN", mod: false, shift: false, alt: false });
      expect(getBinding("previousTrack")).toEqual(DEFAULT_BINDINGS.previousTrack);
    });
  });

  describe("resetAllBindings", () => {
    it("clears every override", () => {
      setBindingOverride("playPause", { code: "KeyP", mod: false, shift: false, alt: false });
      setBindingOverride("nextTrack", { code: "KeyN", mod: false, shift: false, alt: false });
      resetAllBindings();
      expect(getBinding("playPause")).toEqual(DEFAULT_BINDINGS.playPause);
      expect(getBinding("nextTrack")).toEqual(DEFAULT_BINDINGS.nextTrack);
    });
  });

  describe("matchesShortcut", () => {
    it("matches the default play/pause binding", () => {
      expect(matchesShortcut(keyEvent("Space"), "playPause")).toBe(true);
    });

    it("requires exact modifier state", () => {
      // Space+mod must NOT match a bare-Space binding
      expect(matchesShortcut(keyEvent("Space", { meta: true }), "playPause")).toBe(false);
      expect(matchesShortcut(keyEvent("Space", { shift: true }), "playPause")).toBe(false);
    });

    it("distinguishes seek from track navigation by modifier", () => {
      expect(matchesShortcut(keyEvent("ArrowLeft"), "seekBackward")).toBe(true);
      expect(matchesShortcut(keyEvent("ArrowLeft"), "previousTrack")).toBe(false);
      expect(matchesShortcut(keyEvent("ArrowLeft", { meta: true }), "previousTrack")).toBe(true);
      expect(matchesShortcut(keyEvent("ArrowLeft", { meta: true }), "seekBackward")).toBe(false);
    });

    it("treats ctrl and meta both as mod", () => {
      expect(matchesShortcut(keyEvent("KeyF", { meta: true }), "focusSearch")).toBe(true);
      expect(matchesShortcut(keyEvent("KeyF", { ctrl: true }), "focusSearch")).toBe(true);
      expect(matchesShortcut(keyEvent("KeyF"), "focusSearch")).toBe(false);
    });

    it("respects overrides at match time", () => {
      setBindingOverride("playPause", { code: "KeyK", mod: false, shift: false, alt: false });
      expect(matchesShortcut(keyEvent("Space"), "playPause")).toBe(false);
      expect(matchesShortcut(keyEvent("KeyK"), "playPause")).toBe(true);
    });
  });

  describe("eventToBinding", () => {
    it("captures key with modifiers", () => {
      expect(eventToBinding(keyEvent("KeyP", { meta: true, shift: true }))).toEqual({
        code: "KeyP",
        mod: true,
        shift: true,
        alt: false,
      });
    });

    it("returns null for bare modifier keys", () => {
      expect(eventToBinding(keyEvent("MetaLeft", { meta: true }))).toBeNull();
      expect(eventToBinding(keyEvent("ShiftRight", { shift: true }))).toBeNull();
    });
  });

  describe("findConflict", () => {
    it("detects a binding already used by another action", () => {
      const conflict = findConflict(DEFAULT_BINDINGS.playPause, "nextTrack");
      expect(conflict).toBe("Play / Pause");
    });

    it("ignores the excluded action itself", () => {
      expect(findConflict(DEFAULT_BINDINGS.playPause, "playPause")).toBeNull();
    });

    it("returns null for an unused binding", () => {
      expect(findConflict({ code: "KeyQ", mod: true, shift: true, alt: false }, "playPause")).toBeNull();
    });

    it("rejects fixed combos handled outside the registry", () => {
      expect(findConflict({ code: "KeyZ", mod: true, shift: false, alt: false }, "playPause")).toBe("Undo");
      expect(findConflict({ code: "Comma", mod: true, shift: false, alt: false }, "playPause")).toBe("Settings");
      expect(findConflict({ code: "KeyC", mod: true, shift: false, alt: false }, "playPause")).toBe("Copy");
    });

    it("allows combos that only share the key with a reserved combo", () => {
      expect(findConflict({ code: "KeyZ", mod: false, shift: false, alt: false }, "playPause")).toBeNull();
      expect(findConflict({ code: "KeyZ", mod: true, shift: true, alt: false }, "playPause")).toBeNull();
    });
  });

  describe("formatBinding", () => {
    it("formats simple keys", () => {
      expect(formatBinding({ code: "Space", mod: false, shift: false, alt: false })).toEqual(["Space"]);
      expect(formatBinding({ code: "ArrowLeft", mod: false, shift: false, alt: false })).toEqual(["←"]);
    });

    it("formats letter keys from their code", () => {
      const parts = formatBinding({ code: "KeyF", mod: true, shift: false, alt: false });
      expect(parts[parts.length - 1]).toBe("F");
      expect(parts.length).toBe(2);
    });

    it("includes all active modifiers", () => {
      const parts = formatBinding({ code: "KeyX", mod: true, shift: true, alt: true });
      expect(parts).toHaveLength(4);
      expect(parts[parts.length - 1]).toBe("X");
    });
  });

  describe("defaults", () => {
    it("has a definition for every default binding and no duplicates", () => {
      const actions = SHORTCUT_DEFS.map((d) => d.action);
      expect(new Set(actions).size).toBe(actions.length);
      for (const action of actions) {
        expect(DEFAULT_BINDINGS[action]).toBeDefined();
      }
    });

    it("has no conflicting default bindings", () => {
      for (let i = 0; i < SHORTCUT_DEFS.length; i++) {
        for (let j = i + 1; j < SHORTCUT_DEFS.length; j++) {
          const a = DEFAULT_BINDINGS[SHORTCUT_DEFS[i].action];
          const b = DEFAULT_BINDINGS[SHORTCUT_DEFS[j].action];
          expect(bindingsEqual(a, b)).toBe(false);
        }
      }
    });

    it("has no default binding that collides with a reserved combo", () => {
      for (const def of SHORTCUT_DEFS) {
        expect(findConflict(DEFAULT_BINDINGS[def.action], def.action)).toBeNull();
      }
    });
  });
});
