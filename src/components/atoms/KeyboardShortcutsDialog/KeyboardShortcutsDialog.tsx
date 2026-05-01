import { useEffect } from "react";

interface KeyboardShortcutsDialogProps {
  onClose: () => void;
}

const isMac = navigator.platform.toUpperCase().includes("MAC");
const mod = isMac ? "\u2318" : "Ctrl";

const sections = [
  {
    title: "Playback",
    shortcuts: [
      { keys: ["Space"], description: "Play / Pause" },
      { keys: ["\u2190"], description: "Seek backward 10s" },
      { keys: ["\u2192"], description: "Seek forward 10s" },
      { keys: [mod, "\u2190"], description: "Previous track" },
      { keys: [mod, "\u2192"], description: "Next track" },
    ],
  },
  {
    title: "Library",
    shortcuts: [
      { keys: [mod, "F"], description: "Search library" },
      { keys: ["\u2191 / \u2193"], description: "Navigate tracks" },
      { keys: ["Enter"], description: "Play selected track" },
      { keys: ["Escape"], description: "Clear selection" },
      { keys: ["Shift", "\u2191 / \u2193"], description: "Extend selection" },
      { keys: [mod, "Click"], description: "Toggle select track" },
      { keys: ["Shift", "Click"], description: "Range select tracks" },
      { keys: ["Type a\u2013z"], description: "Jump to matching track" },
    ],
  },
  {
    title: "General",
    shortcuts: [{ keys: [mod, "/"], description: "Show this dialog" }],
  },
];

export const KeyboardShortcutsDialog = ({ onClose }: KeyboardShortcutsDialogProps) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-bg-secondary border border-border rounded-2xl shadow-xl w-[480px] max-w-[90vw] max-h-[80vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-3">
          <h2 className="text-sm font-medium text-text-primary">Keyboard Shortcuts</h2>
          <button onClick={onClose} className="text-text-tertiary hover:text-text-secondary transition-colors">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 pb-5">
          {sections.map((section) => (
            <div key={section.title} className="mb-5 last:mb-0">
              <h3 className="text-[10px] font-medium uppercase tracking-wider text-text-tertiary mb-2">
                {section.title}
              </h3>
              <div className="space-y-1">
                {section.shortcuts.map((shortcut) => (
                  <div key={shortcut.description} className="flex items-center justify-between py-1.5">
                    <span className="text-xs text-text-secondary">{shortcut.description}</span>
                    <div className="flex items-center gap-1">
                      {shortcut.keys.map((key, i) => (
                        <span key={i}>
                          {i > 0 && key !== "Click" && shortcut.keys[i - 1] !== mod && (
                            <span className="text-text-tertiary text-[10px] mx-0.5">+</span>
                          )}
                          <kbd className="inline-flex items-center justify-center min-w-[24px] h-6 px-1.5 bg-bg-card border border-border rounded-md text-[11px] font-medium text-text-primary">
                            {key}
                          </kbd>
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
