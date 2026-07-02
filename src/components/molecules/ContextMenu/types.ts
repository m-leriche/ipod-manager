export type ContextMenuItem =
  | {
      type?: "action";
      label: string;
      onClick: () => void;
      disabled?: boolean;
      shortcut?: string;
      /** Renders a leading checkmark in a fixed-width slot (menu-wide, so
          labels stay aligned as items toggle). */
      checked?: boolean;
    }
  | { type: "submenu"; label: string; children: ContextMenuItem[]; disabled?: boolean }
  | { type: "separator" };

export interface ContextMenuProps {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}
