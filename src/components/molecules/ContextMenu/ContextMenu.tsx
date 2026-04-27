import { useEffect, useRef, useState } from "react";
import type { ContextMenuProps, ContextMenuItem } from "./types";

export const ContextMenu = ({ x, y, items, onClose }: ContextMenuProps) => {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

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

  // Measure off-screen on first render, then place in the correct position
  useEffect(() => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const pad = 8;

    let left = x;
    let top = y;

    if (x + rect.width > vw - pad) left = x - rect.width;
    if (y + rect.height > vh - pad) top = y - rect.height;
    if (left < pad) left = pad;
    if (top < pad) top = pad;

    setPos({ left, top });
  }, [x, y]);

  return (
    <div
      ref={ref}
      style={pos ? { left: pos.left, top: pos.top } : { left: x, top: y, visibility: "hidden" }}
      className="fixed z-50 min-w-[160px] bg-bg-card border border-border rounded-xl shadow-lg py-1 overflow-hidden"
    >
      {items.map((item, i) =>
        isSeparator(item) ? (
          <div key={`sep-${i}`} className="h-px bg-border my-1" />
        ) : isSubmenu(item) ? (
          <SubmenuItem key={item.label} item={item} onClose={onClose} />
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

const SubmenuItem = ({
  item,
  onClose,
}: {
  item: Extract<ContextMenuItem, { type: "submenu" }>;
  onClose: () => void;
}) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const handleEnter = () => {
    clearTimeout(timeoutRef.current);
    setOpen(true);
  };

  const handleLeave = () => {
    timeoutRef.current = setTimeout(() => setOpen(false), 150);
  };

  return (
    <div ref={ref} className="relative" onMouseEnter={handleEnter} onMouseLeave={handleLeave}>
      <div
        className={`w-full text-left px-3 py-2 text-[11px] flex items-center justify-between transition-colors ${
          item.disabled
            ? "text-text-tertiary/40 cursor-default"
            : "text-text-secondary hover:bg-bg-hover hover:text-text-primary"
        }`}
      >
        <span>{item.label}</span>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-3 h-3 ml-3">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
      </div>
      {open && !item.disabled && <SubmenuPanel parentRef={ref} items={item.children} onClose={onClose} />}
    </div>
  );
};

const SubmenuPanel = ({
  parentRef,
  items,
  onClose,
}: {
  parentRef: React.RefObject<HTMLDivElement | null>;
  items: ContextMenuItem[];
  onClose: () => void;
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  useEffect(() => {
    if (!ref.current || !parentRef.current) return;
    const parentRect = parentRef.current.getBoundingClientRect();
    const menuRect = ref.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const pad = 8;

    // Try right side, fall back to left
    let left = parentRect.right;
    if (left + menuRect.width > vw - pad) left = parentRect.left - menuRect.width;
    if (left < pad) left = pad;

    let top = parentRect.top;
    if (top + menuRect.height > vh - pad) top = vh - pad - menuRect.height;
    if (top < pad) top = pad;

    setPos({ left, top });
  }, [parentRef]);

  return (
    <div
      ref={ref}
      style={
        pos
          ? { left: pos.left, top: pos.top, position: "fixed" }
          : { left: 0, top: 0, visibility: "hidden", position: "fixed" }
      }
      className="z-[60] min-w-[140px] bg-bg-card border border-border rounded-xl shadow-lg py-1 overflow-hidden"
    >
      {items.map((child, i) =>
        isSeparator(child) ? (
          <div key={`sep-${i}`} className="h-px bg-border my-1" />
        ) : isSubmenu(child) ? null : (
          <button
            key={child.label}
            onClick={() => {
              if (child.disabled) return;
              child.onClick();
              onClose();
            }}
            className={`w-full text-left px-3 py-2 text-[11px] flex items-center justify-between transition-colors ${
              child.disabled
                ? "text-text-tertiary/40 cursor-default"
                : "text-text-secondary hover:bg-bg-hover hover:text-text-primary"
            }`}
          >
            <span>{child.label}</span>
          </button>
        ),
      )}
    </div>
  );
};

const isSeparator = (item: ContextMenuItem): item is { type: "separator" } => item.type === "separator";
const isSubmenu = (item: ContextMenuItem): item is Extract<ContextMenuItem, { type: "submenu" }> =>
  item.type === "submenu";
