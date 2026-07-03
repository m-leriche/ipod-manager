import { useEffect, useMemo } from "react";
import { SHORTCUT_DEFS, getBinding, formatBinding } from "../../../utils/shortcuts";

interface KeyboardShortcutsDialogProps {
  onClose: () => void;
}

const isMac = navigator.platform.toUpperCase().includes("MAC");
const mod = isMac ? "\u2318" : "Ctrl";

const registryKeys = (action: (typeof SHORTCUT_DEFS)[number]["action"]) => formatBinding(getBinding(action));

const registrySection = (category: (typeof SHORTCUT_DEFS)[number]["category"]) =>
  SHORTCUT_DEFS.filter((d) => d.category === category).map((d) => ({
    keys: registryKeys(d.action),
    description: d.label,
  }));

const buildSections = () => [
  { title: "Playback", shortcuts: registrySection("Playback") },
  { title: "Navigation", shortcuts: registrySection("Navigation") },
  {
    title: "Library",
    shortcuts: [
      ...registrySection("Library"),
      { keys: ["\u2191 / \u2193"], description: "Navigate tracks" },
      { keys: ["Enter"], description: "Play selected track" },
      { keys: ["Escape"], description: "Clear selection" },
      { keys: ["Shift", "\u2191 / \u2193"], description: "Extend selection" },
      { keys: [mod, "Click"], description: "Toggle select track" },
      { keys: ["Shift", "Click"], description: "Range select tracks" },
      { keys: ["Type a\u2013z"], description: "Jump to matching track" },
    ],
  },
  { title: "General", shortcuts: registrySection("General") },
];

export const KeyboardShortcutsDialog = ({ onClose }: KeyboardShortcutsDialogProps) => {
  const sections = useMemo(() => buildSections(), []);
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
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="shortcuts-dialog-title"
        className="relative bg-bg-secondary border border-border rounded-2xl shadow-xl w-[480px] max-w-[90vw] max-h-[80vh] overflow-hidden flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-3">
          <h2 id="shortcuts-dialog-title" className="text-sm font-medium text-text-primary">
            Keyboard Shortcuts
          </h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-text-tertiary hover:text-text-secondary transition-colors"
          >
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
          <p className="text-[10px] text-text-tertiary pt-1">
            Most shortcuts can be customized in Settings → Shortcuts. List navigation and click-modifier shortcuts are
            fixed.
          </p>
        </div>
      </div>
    </div>
  );
};
