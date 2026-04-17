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

// Mock PlaybackContext
vi.mock("../contexts/PlaybackContext", () => ({
  usePlayback: () => ({
    state: {
      currentTrack: null,
      isPlaying: false,
      volume: 0.8,
      queue: [],
      queueIndex: -1,
      shuffle: false,
      repeat: "off",
    },
    playTrack: vi.fn(),
    playAlbum: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    stop: vi.fn(),
    next: vi.fn(),
    previous: vi.fn(),
    seekTo: vi.fn(),
    setVolume: vi.fn(),
    addToQueue: vi.fn(),
    playNext: vi.fn(),
    removeFromQueue: vi.fn(),
    reorderQueue: vi.fn(),
    clearQueue: vi.fn(),
    toggleShuffle: vi.fn(),
    cycleRepeat: vi.fn(),
  }),
  usePlaybackTime: () => ({ currentTime: 0, duration: 0 }),
  PlaybackProvider: ({ children }: { children: React.ReactNode }) => children,
}));

// Mock @tauri-apps/api/core
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
  convertFileSrc: vi.fn((path: string) => `http://asset.localhost/${encodeURIComponent(path)}`),
}));

// Mock @tauri-apps/api/event
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(() => Promise.resolve(() => {})),
}));

// Mock @tauri-apps/plugin-dialog
vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: vi.fn(),
}));

// Mock @tauri-apps/api/webview
vi.mock("@tauri-apps/api/webview", () => ({
  getCurrentWebview: () => ({
    onDragDropEvent: vi.fn(() => Promise.resolve(() => {})),
  }),
}));
