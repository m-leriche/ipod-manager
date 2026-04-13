/** Background for the source (left) cell per status */
export const LEFT_CELL_BG: Record<string, string> = {
  source_only: "bg-success/[0.05]",
  target_only: "",
  modified: "bg-warning/[0.05]",
  same: "opacity-40",
};

/** Background for the target (right) cell per status */
export const RIGHT_CELL_BG: Record<string, string> = {
  source_only: "",
  target_only: "bg-danger/[0.05]",
  modified: "bg-warning/[0.05]",
  same: "opacity-40",
};

/** Ghost cell styling: the side where the file is absent */
export const GHOST_BORDER: Record<string, string> = {
  source_only: "border-l-2 border-dashed border-success/20",
  target_only: "border-l-2 border-dashed border-danger/20",
};

/** Gutter icon and color per status */
export const GUTTER_ICON: Record<string, { icon: string; color: string }> = {
  source_only: { icon: "\u2192", color: "text-success" },
  target_only: { icon: "\u2190", color: "text-danger" },
  modified: { icon: "\u2260", color: "text-warning" },
  same: { icon: "", color: "" },
};
