import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { EqualizerPanel } from "./EqualizerPanel";

const mockSetIsOpen = vi.fn();
const mockSetEnabled = vi.fn();
const mockSetBandMode = vi.fn();
const mockSetGain = vi.fn();
const mockSetPreamp = vi.fn();
const mockResetGains = vi.fn();

const defaultState = {
  enabled: false,
  bandMode: "10" as const,
  gains10: new Array(10).fill(0),
  gains31: new Array(31).fill(0),
  preamp: 0,
  activePreset: null,
  parametricBands: null,
};

vi.mock("../../../contexts/EqualizerContext", () => ({
  useEqualizer: () => ({
    state: defaultState,
    isOpen: true,
    setIsOpen: mockSetIsOpen,
    setEnabled: mockSetEnabled,
    setBandMode: mockSetBandMode,
    setGain: mockSetGain,
    setPreamp: mockSetPreamp,
    resetGains: mockResetGains,
    customPresets: [],
    selectPreset: vi.fn(),
    savePreset: vi.fn(),
    deletePreset: vi.fn(),
  }),
}));

describe("EqualizerPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the panel with header and controls", () => {
    render(<EqualizerPanel />);
    expect(screen.getByText("Equalizer")).toBeInTheDocument();
    expect(screen.getByText("OFF")).toBeInTheDocument();
    expect(screen.getByText("10 Band")).toBeInTheDocument();
    expect(screen.getByText("31 Band")).toBeInTheDocument();
    expect(screen.getByText("Reset")).toBeInTheDocument();
  });

  it("renders 10 band sliders plus preamp in 10-band mode", () => {
    render(<EqualizerPanel />);
    expect(screen.getByText("Pre")).toBeInTheDocument();
    expect(screen.getByText("31")).toBeInTheDocument();
    expect(screen.getByText("62")).toBeInTheDocument();
    expect(screen.getByText("125")).toBeInTheDocument();
    expect(screen.getByText("16k")).toBeInTheDocument();
  });

  it("calls setEnabled when toggling enable button", () => {
    render(<EqualizerPanel />);
    fireEvent.click(screen.getByText("OFF"));
    expect(mockSetEnabled).toHaveBeenCalledWith(true);
  });

  it("calls setBandMode when switching modes", () => {
    render(<EqualizerPanel />);
    fireEvent.click(screen.getByText("31 Band"));
    expect(mockSetBandMode).toHaveBeenCalledWith("31");
  });

  it("calls resetGains when clicking reset", () => {
    render(<EqualizerPanel />);
    fireEvent.click(screen.getByText("Reset"));
    expect(mockResetGains).toHaveBeenCalled();
  });

  it("calls setIsOpen(false) when clicking close button", () => {
    render(<EqualizerPanel />);
    // The close button is the last button with an X svg
    const buttons = screen.getAllByRole("button");
    fireEvent.click(buttons[buttons.length - 1]);
    expect(mockSetIsOpen).toHaveBeenCalledWith(false);
  });
});
