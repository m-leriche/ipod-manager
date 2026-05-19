import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { invoke } from "@tauri-apps/api/core";

vi.unmock("./EqualizerContext");
import { EqualizerProvider, useEqualizer } from "./EqualizerContext";

const wrapper = ({ children }: { children: React.ReactNode }) => <EqualizerProvider>{children}</EqualizerProvider>;

beforeEach(() => {
  localStorage.clear();
  vi.mocked(invoke).mockResolvedValue(undefined);
});

describe("EqualizerContext", () => {
  it("throws when useEqualizer is used outside provider", () => {
    expect(() => renderHook(() => useEqualizer())).toThrow("useEqualizer must be used within EqualizerProvider");
  });

  it("has correct default state", () => {
    const { result } = renderHook(() => useEqualizer(), { wrapper });

    expect(result.current.state.enabled).toBe(false);
    expect(result.current.state.bandMode).toBe("10");
    expect(result.current.state.gains10).toEqual(new Array(10).fill(0));
    expect(result.current.state.gains31).toEqual(new Array(31).fill(0));
    expect(result.current.state.preamp).toBe(0);
    expect(result.current.state.activePreset).toBeNull();
    expect(result.current.state.parametricBands).toBeNull();
  });

  it("setEnabled(true) enables EQ and calls invoke", async () => {
    const { result } = renderHook(() => useEqualizer(), { wrapper });

    await act(async () => {
      result.current.setEnabled(true);
    });

    expect(result.current.state.enabled).toBe(true);
    expect(vi.mocked(invoke)).toHaveBeenCalledWith("audio_set_eq", expect.any(Object));
  });

  it("setGain(index, value) updates gain for current band mode and clears preset", async () => {
    const { result } = renderHook(() => useEqualizer(), { wrapper });

    await act(async () => {
      result.current.setGain(0, 5);
    });

    expect(result.current.state.gains10[0]).toBe(5);
    expect(result.current.state.activePreset).toBeNull();
  });

  it("setBandMode('31') switches mode and clears preset and parametric bands", async () => {
    const { result } = renderHook(() => useEqualizer(), { wrapper });

    await act(async () => {
      result.current.setBandMode("31");
    });

    expect(result.current.state.bandMode).toBe("31");
    expect(result.current.state.activePreset).toBeNull();
    expect(result.current.state.parametricBands).toBeNull();
  });

  it("setPreamp(value) sets preamp and clears preset", async () => {
    const { result } = renderHook(() => useEqualizer(), { wrapper });

    await act(async () => {
      result.current.setPreamp(3);
    });

    expect(result.current.state.preamp).toBe(3);
    expect(result.current.state.activePreset).toBeNull();
  });

  it("resetGains() zeroes all gains", async () => {
    const { result } = renderHook(() => useEqualizer(), { wrapper });

    // Set some gains first
    await act(async () => {
      result.current.setGain(0, 5);
      result.current.setGain(1, -3);
      result.current.setPreamp(2);
    });

    await act(async () => {
      result.current.resetGains();
    });

    expect(result.current.state.gains10).toEqual(new Array(10).fill(0));
    expect(result.current.state.gains31).toEqual(new Array(31).fill(0));
    expect(result.current.state.preamp).toBe(0);
    expect(result.current.state.activePreset).toBeNull();
  });

  it("selectPreset('Rock') loads built-in preset gains", async () => {
    const { result } = renderHook(() => useEqualizer(), { wrapper });

    await act(async () => {
      result.current.selectPreset("Rock");
    });

    expect(result.current.state.activePreset).toBe("Rock");
    expect(result.current.state.gains10).toEqual([5, 4, 3, 1.5, -0.5, -1, 0.5, 2.5, 3.5, 4.5]);
    expect(result.current.state.preamp).toBe(-3);
  });

  it("selectPreset(null) clears preset", async () => {
    const { result } = renderHook(() => useEqualizer(), { wrapper });

    await act(async () => {
      result.current.selectPreset("Rock");
    });
    expect(result.current.state.activePreset).toBe("Rock");

    await act(async () => {
      result.current.selectPreset(null);
    });

    expect(result.current.state.activePreset).toBeNull();
    expect(result.current.state.parametricBands).toBeNull();
  });

  it("savePreset() saves custom preset and persists to localStorage", async () => {
    const { result } = renderHook(() => useEqualizer(), { wrapper });

    await act(async () => {
      result.current.setGain(0, 6);
    });

    await act(async () => {
      result.current.savePreset("My EQ");
    });

    expect(result.current.state.activePreset).toBe("My EQ");
    expect(result.current.customPresets).toHaveLength(1);
    expect(result.current.customPresets[0].name).toBe("My EQ");
    expect(result.current.customPresets[0].gains[0]).toBe(6);

    const stored = JSON.parse(localStorage.getItem("crate-equalizer-presets") ?? "[]");
    expect(stored).toHaveLength(1);
    expect(stored[0].name).toBe("My EQ");
  });

  it("deletePreset() removes from custom presets and clears if active", async () => {
    const { result } = renderHook(() => useEqualizer(), { wrapper });

    await act(async () => {
      result.current.savePreset("My EQ");
    });
    expect(result.current.customPresets).toHaveLength(1);
    expect(result.current.state.activePreset).toBe("My EQ");

    await act(async () => {
      result.current.deletePreset("My EQ");
    });

    expect(result.current.customPresets).toHaveLength(0);
    expect(result.current.state.activePreset).toBeNull();
  });

  it("persists state to localStorage on change and restores on mount", async () => {
    const { result, unmount } = renderHook(() => useEqualizer(), { wrapper });

    await act(async () => {
      result.current.setEnabled(true);
      result.current.setPreamp(5);
    });

    unmount();

    // Re-render — should restore from localStorage
    const { result: result2 } = renderHook(() => useEqualizer(), { wrapper });
    expect(result2.current.state.enabled).toBe(true);
    expect(result2.current.state.preamp).toBe(5);
  });

  it("setParametricBandGain() updates parametric band gain", async () => {
    const { result } = renderHook(() => useEqualizer(), { wrapper });

    // Select a parametric preset first
    await act(async () => {
      result.current.selectPreset("Sennheiser HD660S2");
    });

    expect(result.current.state.parametricBands).not.toBeNull();
    const originalGain = result.current.state.parametricBands![0].gain;

    await act(async () => {
      result.current.setParametricBandGain(0, 7.5);
    });

    expect(result.current.state.parametricBands![0].gain).toBe(7.5);
    expect(result.current.state.parametricBands![0].gain).not.toBe(originalGain);
    expect(result.current.state.activePreset).toBeNull(); // Clears preset on manual change
  });
});
