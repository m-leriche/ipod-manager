import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, beforeEach } from "vitest";
import { useResizableWidth } from "./useResizableWidth";

beforeEach(() => {
  localStorage.clear();
});

describe("useResizableWidth", () => {
  it("returns default width of 280 when no saved value", () => {
    const { result } = renderHook(() => useResizableWidth());
    expect(result.current.width).toBe(280);
  });

  it("loads saved width from localStorage", () => {
    localStorage.setItem("crate-lyrics-panel-width", "350");
    const { result } = renderHook(() => useResizableWidth());
    expect(result.current.width).toBe(350);
  });

  it("clamps saved width to min/max bounds", () => {
    localStorage.setItem("crate-lyrics-panel-width", "50");
    const { result: low } = renderHook(() => useResizableWidth());
    expect(low.current.width).toBe(180);

    localStorage.setItem("crate-lyrics-panel-width", "9999");
    const { result: high } = renderHook(() => useResizableWidth());
    expect(high.current.width).toBe(500);
  });

  it("provides an onDragStart handler", () => {
    const { result } = renderHook(() => useResizableWidth());
    expect(typeof result.current.onDragStart).toBe("function");
  });

  it("updates width on mouse drag and persists on release", () => {
    const { result } = renderHook(() => useResizableWidth());

    // Simulate drag start
    act(() => {
      result.current.onDragStart({
        preventDefault: () => {},
        clientX: 500,
      } as React.MouseEvent);
    });

    // Simulate drag left (should widen)
    act(() => {
      window.dispatchEvent(new MouseEvent("mousemove", { clientX: 450 }));
    });
    expect(result.current.width).toBe(330); // 280 + 50

    // Release
    act(() => {
      window.dispatchEvent(new MouseEvent("mouseup"));
    });
    expect(localStorage.getItem("crate-lyrics-panel-width")).toBe("330");
  });
});
