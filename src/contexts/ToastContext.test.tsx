import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { ToastProvider, useToast, useToastState } from "./ToastContext";

// Unmock ToastContext for these tests since we're testing the real implementation
vi.unmock("./ToastContext");

const wrapper = ({ children }: { children: React.ReactNode }) => <ToastProvider>{children}</ToastProvider>;

/** Hook that combines actions + state for test convenience. */
const useToastAll = () => ({ ...useToast(), toasts: useToastState() });

describe("ToastContext", () => {
  it("starts with empty toast list", () => {
    const { result } = renderHook(() => useToastState(), { wrapper });
    expect(result.current).toEqual([]);
  });

  it("adds a success toast", () => {
    const { result } = renderHook(() => useToastAll(), { wrapper });

    act(() => {
      result.current.success("Done!");
    });

    expect(result.current.toasts).toHaveLength(1);
    expect(result.current.toasts[0].type).toBe("success");
    expect(result.current.toasts[0].message).toBe("Done!");
  });

  it("adds an error toast", () => {
    const { result } = renderHook(() => useToastAll(), { wrapper });

    act(() => {
      result.current.error("Something broke");
    });

    expect(result.current.toasts).toHaveLength(1);
    expect(result.current.toasts[0].type).toBe("error");
  });

  it("dismisses a toast by id", () => {
    const { result } = renderHook(() => useToastAll(), { wrapper });

    act(() => {
      result.current.success("First");
      result.current.error("Second");
    });

    expect(result.current.toasts).toHaveLength(2);

    act(() => {
      result.current.dismiss(result.current.toasts[0].id);
    });

    expect(result.current.toasts).toHaveLength(1);
    expect(result.current.toasts[0].message).toBe("Second");
  });

  it("throws when used outside provider", () => {
    expect(() => {
      renderHook(() => useToast());
    }).toThrow("useToast must be used within ToastProvider");
  });

  it("throws useToastState when used outside provider", () => {
    expect(() => {
      renderHook(() => useToastState());
    }).toThrow("useToastState must be used within ToastProvider");
  });
});
