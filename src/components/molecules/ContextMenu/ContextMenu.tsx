import { useEffect, useRef } from "react";
import type { ContextMenuProps, ContextMenuItem } from "./types";

export const ContextMenu = ({ x, y, items, onClose }: ContextMenuProps) => {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("keydown", handleKey);
    document.addEventListener("mousedown", handleClick);
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.removeEventListener("mousedown", handleClick);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      style={{ left: x, top: y }}
      className="fixed z-50 min-w-[160px] bg-bg-card border border-border rounded-xl shadow-lg py-1 overflow-hidden"
    >
      {items.map((item, i) =>
        isSeparator(item) ? (
          <div key={`sep-${i}`} className="h-px bg-border my-1" />
        ) : (
          <button
            key={item.label}
            onClick={() => {
              if (item.disabled) return;
              item.onClick();
              onClose();
            }}
            className={`w-full text-left px-3 py-2 text-[11px] flex items-center justify-between transition-colors ${
              item.disabled
                ? "text-text-tertiary/40 cursor-default"
                : "text-text-secondary hover:bg-bg-hover hover:text-text-primary"
            }`}
          >
            <span>{item.label}</span>
            {item.shortcut && <span className="text-text-tertiary text-[10px] ml-4">{item.shortcut}</span>}
          </button>
        ),
      )}
    </div>
  );
};

const isSeparator = (item: ContextMenuItem): item is { type: "separator" } => item.type === "separator";
