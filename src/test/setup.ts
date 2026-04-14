import "@testing-library/jest-dom/vitest";
import { afterEach, vi } from "vitest";

afterEach(() => {
  vi.clearAllMocks();
});

// Mock ProgressContext — provides a no-op implementation for all components
vi.mock("../contexts/ProgressContext", () => ({
  useProgress: () => ({
    state: { active: false, title: "", completed: 0, total: 0, currentItem: "", canCancel: false, result: null },
    start: vi.fn(),
    update: vi.fn(),
    finish: vi.fn(),
    fail: vi.fn(),
    dismiss: vi.fn(),
    cancel: vi.fn(),
  }),
  ProgressProvider: ({ children }: { children: React.ReactNode }) => children,
}));

// Mock @tauri-apps/api/core
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

// Mock @tauri-apps/api/event
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(() => Promise.resolve(() => {})),
}));

// Mock @tauri-apps/plugin-dialog
vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: vi.fn(),
}));
