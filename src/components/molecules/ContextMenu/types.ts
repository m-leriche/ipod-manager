import type { ContextMenuItem } from "../../../types/profiles";

export interface ContextMenuProps {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}
