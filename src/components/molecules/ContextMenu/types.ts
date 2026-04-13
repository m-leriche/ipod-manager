export type ContextMenuItem =
  | { type?: "action"; label: string; onClick: () => void; disabled?: boolean; shortcut?: string }
  | { type: "separator" };

export interface ContextMenuProps {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}
