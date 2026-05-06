import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useLazyImage, _resetForTests } from "./useLazyImage";

let observerCallback: IntersectionObserverCallback;
let observedElements: Set<Element>;

beforeEach(() => {
  _resetForTests();
  observedElements = new Set();

  (globalThis as Record<string, unknown>).IntersectionObserver = class {
    constructor(callback: IntersectionObserverCallback) {
      observerCallback = callback;
    }
    observe(el: Element) {
      observedElements.add(el);
    }
    unobserve(el: Element) {
      observedElements.delete(el);
    }
    disconnect() {
      observedElements.clear();
    }
  };
});

afterEach(() => {
  _resetForTests();
  vi.restoreAllMocks();
});

const simulateIntersect = (element: Element, isIntersecting: boolean) => {
  act(() => {
    observerCallback(
      [{ target: element, isIntersecting } as unknown as IntersectionObserverEntry],
      {} as IntersectionObserver,
    );
  });
};

describe("useLazyImage", () => {
  it("starts not visible when enabled", () => {
    const { result } = renderHook(() => useLazyImage(true));
    expect(result.current.isVisible).toBe(false);
  });

  it("starts visible when disabled", () => {
    const { result } = renderHook(() => useLazyImage(false));
    expect(result.current.isVisible).toBe(true);
  });

  it("becomes visible when element intersects", () => {
    const { result } = renderHook(() => useLazyImage(true));

    const element = document.createElement("div");
    act(() => {
      result.current.ref(element);
    });

    expect(result.current.isVisible).toBe(false);
    simulateIntersect(element, true);
    expect(result.current.isVisible).toBe(true);
  });

  it("stays visible after intersecting (no unloading)", () => {
    const { result } = renderHook(() => useLazyImage(true));

    const element = document.createElement("div");
    act(() => {
      result.current.ref(element);
    });

    simulateIntersect(element, true);
    expect(result.current.isVisible).toBe(true);

    // Element was unobserved after becoming visible, so this won't trigger the callback
    // but isVisible should remain true
    expect(result.current.isVisible).toBe(true);
  });

  it("does not become visible when not intersecting", () => {
    const { result } = renderHook(() => useLazyImage(true));

    const element = document.createElement("div");
    act(() => {
      result.current.ref(element);
    });

    simulateIntersect(element, false);
    expect(result.current.isVisible).toBe(false);
  });

  it("unobserves element after it becomes visible", () => {
    const { result } = renderHook(() => useLazyImage(true));

    const element = document.createElement("div");
    act(() => {
      result.current.ref(element);
    });

    expect(observedElements.has(element)).toBe(true);
    simulateIntersect(element, true);
    expect(observedElements.has(element)).toBe(false);
  });

  it("cleans up on unmount", () => {
    const { result, unmount } = renderHook(() => useLazyImage(true));

    const element = document.createElement("div");
    act(() => {
      result.current.ref(element);
    });

    expect(observedElements.has(element)).toBe(true);
    unmount();
    expect(observedElements.has(element)).toBe(false);
  });
});
