import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TemplatesModal } from "./TemplatesModal";
import { getSetting, setSetting } from "../../../utils/settings";
import type { MetadataTemplate } from "../../../types/metadata";

const savedTemplate: MetadataTemplate = {
  id: "t1",
  name: "Compilation",
  fields: { album_artist: "Various Artists", genre: "Soundtrack" },
};

const renderModal = (onApply = vi.fn(), onClose = vi.fn()) => {
  render(<TemplatesModal targetLabel="3 selected tracks" onApply={onApply} onClose={onClose} />);
  return { onApply, onClose };
};

describe("TemplatesModal", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("shows an empty state when there are no templates", () => {
    renderModal();
    expect(screen.getByText("No templates yet.")).toBeInTheDocument();
  });

  it("lists saved templates with their fields", () => {
    setSetting("metadataTemplates", [savedTemplate]);
    renderModal();
    expect(screen.getByText("Compilation")).toBeInTheDocument();
    expect(screen.getByText(/Various Artists/)).toBeInTheDocument();
  });

  it("applies a template", () => {
    setSetting("metadataTemplates", [savedTemplate]);
    const { onApply } = renderModal();
    fireEvent.click(screen.getByTestId("apply-template-t1"));
    expect(onApply).toHaveBeenCalledWith(savedTemplate);
  });

  it("creates and persists a new template", () => {
    renderModal();
    fireEvent.click(screen.getByTestId("create-template"));
    fireEvent.change(screen.getByTestId("template-name-input"), { target: { value: "My Preset" } });
    fireEvent.change(screen.getByTestId("template-field-genre"), { target: { value: "Jazz" } });
    fireEvent.click(screen.getByTestId("save-template"));

    const stored = getSetting("metadataTemplates");
    expect(stored).toHaveLength(1);
    expect(stored[0].name).toBe("My Preset");
    expect(stored[0].fields).toEqual({ genre: "Jazz" });
    expect(screen.getByText("My Preset")).toBeInTheDocument();
  });

  it("only accepts digits in the year field", () => {
    renderModal();
    fireEvent.click(screen.getByTestId("create-template"));

    const yearInput = screen.getByTestId("template-field-year") as HTMLInputElement;
    fireEvent.change(yearInput, { target: { value: "ninety" } });
    expect(yearInput.value).toBe("");

    fireEvent.change(yearInput, { target: { value: "1999x" } });
    expect(yearInput.value).toBe("1999");
  });

  it("does not save a template whose only field is a rejected year", () => {
    renderModal();
    fireEvent.click(screen.getByTestId("create-template"));
    fireEvent.change(screen.getByTestId("template-name-input"), { target: { value: "Year Only" } });
    fireEvent.change(screen.getByTestId("template-field-year"), { target: { value: "ninety" } });

    // Non-numeric input was stripped, so no field has a value
    expect(screen.getByTestId("save-template")).toBeDisabled();
    expect(getSetting("metadataTemplates")).toHaveLength(0);
  });

  it("disables save until a name and at least one field are set", () => {
    renderModal();
    fireEvent.click(screen.getByTestId("create-template"));
    expect(screen.getByTestId("save-template")).toBeDisabled();

    fireEvent.change(screen.getByTestId("template-name-input"), { target: { value: "Named" } });
    expect(screen.getByTestId("save-template")).toBeDisabled();

    fireEvent.change(screen.getByTestId("template-field-artist"), { target: { value: "Someone" } });
    expect(screen.getByTestId("save-template")).toBeEnabled();
  });

  it("deletes a template after confirmation", () => {
    setSetting("metadataTemplates", [savedTemplate]);
    renderModal();

    fireEvent.click(screen.getByTestId("delete-template-t1"));
    fireEvent.click(screen.getByTestId("confirm-delete-template-t1"));

    expect(getSetting("metadataTemplates")).toHaveLength(0);
    expect(screen.queryByText("Compilation")).not.toBeInTheDocument();
  });

  it("closes on Escape", () => {
    const onClose = vi.fn();
    renderModal(vi.fn(), onClose);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });
});
