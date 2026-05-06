export type PaneLayout = "horizontal" | "vertical";

export interface BrowseExplorerProps {
  leftPath: string | null;
  rightPath: string | null;
  dualPane: boolean;
  layout: PaneLayout;
  onLeftPathChange: (path: string) => void;
  onRightPathChange: (path: string) => void;
  onDualPaneChange: (v: boolean) => void;
  onLayoutChange: (v: PaneLayout) => void;
}
