import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CustomThemeEditor } from "./CustomThemeEditor";

const mockSetTheme = vi.fn();
const mockSaveCustomTheme = vi.fn(() => "new-id");

vi.mock("../../../contexts/ThemeContext", () => ({
  useTheme: () => ({
    theme: "dark",
    setTheme: mockSetTheme,
    customThemes: [],
    saveCustomTheme: mockSaveCustomTheme,
    deleteCustomTheme: vi.fn(),
  }),
}));

vi.mock("../../../utils/themeColors", () => ({
  previewTheme: vi.fn(),
  clearCustomThemeVars: vi.fn(),
}));

describe("CustomThemeEditor", () => {
  const onSave = vi.fn();
  const onCancel = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders name input and color pickers", () => {
    render(<CustomThemeEditor onSave={onSave} onCancel={onCancel} />);
    expect(screen.getByTestId("theme-name-input")).toBeInTheDocument();
    expect(screen.getByTestId("theme-bg-picker")).toBeInTheDocument();
    expect(screen.getByTestId("theme-accent-picker")).toBeInTheDocument();
    expect(screen.getByTestId("theme-text-picker")).toBeInTheDocument();
  });

  it("save button is disabled when name is empty", () => {
    render(<CustomThemeEditor onSave={onSave} onCancel={onCancel} />);
    expect(screen.getByTestId("theme-save-btn")).toBeDisabled();
  });

  it("save button is enabled when name is provided", () => {
    render(<CustomThemeEditor onSave={onSave} onCancel={onCancel} />);
    fireEvent.change(screen.getByTestId("theme-name-input"), { target: { value: "My Theme" } });
    expect(screen.getByTestId("theme-save-btn")).not.toBeDisabled();
  });

  it("calls saveCustomTheme and setTheme on save", () => {
    render(<CustomThemeEditor onSave={onSave} onCancel={onCancel} />);
    fireEvent.change(screen.getByTestId("theme-name-input"), { target: { value: "Night" } });
    fireEvent.click(screen.getByTestId("theme-save-btn"));

    expect(mockSaveCustomTheme).toHaveBeenCalledWith({
      id: undefined,
      name: "Night",
      background: "#121212",
      accent: "#0066ff",
      text: "#ffffff",
    });
    expect(mockSetTheme).toHaveBeenCalledWith("custom:new-id");
    expect(onSave).toHaveBeenCalled();
  });

  it("restores previous theme on cancel", () => {
    render(<CustomThemeEditor onSave={onSave} onCancel={onCancel} />);
    fireEvent.click(screen.getByTestId("theme-cancel-btn"));
    expect(mockSetTheme).toHaveBeenCalledWith("dark");
    expect(onCancel).toHaveBeenCalled();
  });

  it("pre-fills values when editing an existing theme", () => {
    const existing = { id: "abc", name: "Ocean", background: "#0a192f", accent: "#64ffda", text: "#e6f1ff" };
    render(<CustomThemeEditor initial={existing} onSave={onSave} onCancel={onCancel} />);

    expect((screen.getByTestId("theme-name-input") as HTMLInputElement).value).toBe("Ocean");
    expect((screen.getByTestId("theme-bg-picker") as HTMLInputElement).value).toBe("#0a192f");
    expect((screen.getByTestId("theme-accent-picker") as HTMLInputElement).value).toBe("#64ffda");
    expect((screen.getByTestId("theme-text-picker") as HTMLInputElement).value).toBe("#e6f1ff");
  });

  it("passes existing id when editing", () => {
    const existing = { id: "abc", name: "Ocean", background: "#0a192f", accent: "#64ffda", text: "#e6f1ff" };
    render(<CustomThemeEditor initial={existing} onSave={onSave} onCancel={onCancel} />);
    fireEvent.click(screen.getByTestId("theme-save-btn"));

    expect(mockSaveCustomTheme).toHaveBeenCalledWith(expect.objectContaining({ id: "abc", name: "Ocean" }));
  });

  it("trims whitespace from name on save", () => {
    render(<CustomThemeEditor onSave={onSave} onCancel={onCancel} />);
    fireEvent.change(screen.getByTestId("theme-name-input"), { target: { value: "  Neon  " } });
    fireEvent.click(screen.getByTestId("theme-save-btn"));

    expect(mockSaveCustomTheme).toHaveBeenCalledWith(expect.objectContaining({ name: "Neon" }));
  });

  it("renders hex text inputs for each color picker", () => {
    render(<CustomThemeEditor onSave={onSave} onCancel={onCancel} />);
    expect(screen.getByTestId("theme-bg-picker-hex")).toBeInTheDocument();
    expect(screen.getByTestId("theme-accent-picker-hex")).toBeInTheDocument();
    expect(screen.getByTestId("theme-text-picker-hex")).toBeInTheDocument();
  });

  it("updates color when valid hex is typed", () => {
    render(<CustomThemeEditor onSave={onSave} onCancel={onCancel} />);
    fireEvent.change(screen.getByTestId("theme-accent-picker-hex"), { target: { value: "#1db954" } });
    expect((screen.getByTestId("theme-accent-picker") as HTMLInputElement).value).toBe("#1db954");
  });

  it("does not update color for partial hex input", () => {
    render(<CustomThemeEditor onSave={onSave} onCancel={onCancel} />);
    fireEvent.change(screen.getByTestId("theme-accent-picker-hex"), { target: { value: "#1db" } });
    // Original value unchanged
    expect((screen.getByTestId("theme-accent-picker") as HTMLInputElement).value).toBe("#0066ff");
  });

  it("reverts hex text to current value on blur", () => {
    render(<CustomThemeEditor onSave={onSave} onCancel={onCancel} />);
    const hexInput = screen.getByTestId("theme-accent-picker-hex") as HTMLInputElement;
    fireEvent.change(hexInput, { target: { value: "#bad" } });
    fireEvent.blur(hexInput);
    expect(hexInput.value).toBe("#0066ff");
  });
});
