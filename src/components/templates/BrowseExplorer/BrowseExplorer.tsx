import { useRef } from "react";
import { pickFolder } from "../../../utils/pickPath";
import { FolderPicker } from "../../atoms/FolderPicker/FolderPicker";
import { FileExplorer } from "../../organisms/FileExplorer/FileExplorer";
import type { FileExplorerHandle } from "../../organisms/FileExplorer/types";
import type { BrowseExplorerProps } from "./types";

export const BrowseExplorer = ({
  leftPath,
  rightPath,
  dualPane,
  layout,
  onLeftPathChange,
  onRightPathChange,
  onDualPaneChange,
  onLayoutChange,
}: BrowseExplorerProps) => {
  const leftRef = useRef<FileExplorerHandle>(null);
  const rightRef = useRef<FileExplorerHandle>(null);

  const browseLeft = async () => {
    const path = await pickFolder("Select folder to explore");
    if (path) onLeftPathChange(path);
  };

  const browseRight = async () => {
    const path = await pickFolder("Select folder to explore");
    if (path) onRightPathChange(path);
  };

  // No left folder selected — show folder picker at top
  if (!leftPath) {
    return (
      <div className="flex-1 min-w-0 flex flex-col gap-3 min-h-0">
        <FolderPicker label="Folder" path={null} onBrowse={browseLeft} placeholder="Choose a folder to explore" />
      </div>
    );
  }

  const splitButtons = (
    <div className="flex gap-1 shrink-0">
      <button
        onClick={() => onDualPaneChange(!dualPane)}
        className={`px-2.5 py-1.5 rounded-lg text-[11px] font-medium border transition-all ${
          dualPane
            ? "bg-accent/10 border-accent/30 text-accent"
            : "bg-bg-card border-border text-text-tertiary hover:text-text-secondary hover:border-border-active"
        }`}
        title={dualPane ? "Close split pane" : "Open split pane"}
      >
        Split
      </button>
      {dualPane && (
        <button
          onClick={() => onLayoutChange(layout === "horizontal" ? "vertical" : "horizontal")}
          className="px-2.5 py-1.5 bg-bg-card border border-border text-text-tertiary rounded-lg text-[11px] font-medium hover:text-text-secondary hover:border-border-active transition-all"
          title={layout === "horizontal" ? "Stack vertically" : "Side by side"}
        >
          {layout === "horizontal" ? "\u2B0D" : "\u2B0C"}
        </button>
      )}
    </div>
  );

  if (!dualPane) {
    return (
      <div className="flex-1 min-w-0 flex flex-col gap-3 min-h-0">
        <div className="flex items-center gap-2 shrink-0 min-h-0">
          <div className="flex-1 min-w-0">
            <FolderPicker label="Folder" path={leftPath} onBrowse={browseLeft} />
          </div>
          {splitButtons}
        </div>
        <FileExplorer
          rootPath={leftPath}
          rootLabel={leftPath.split("/").pop() || leftPath}
          allowParentNavigation
          allowDelete
        />
      </div>
    );
  }

  return (
    <div className="flex-1 min-w-0 flex flex-col gap-3 min-h-0">
      <div
        className={
          layout === "horizontal"
            ? "flex-1 min-h-0 min-w-0 grid grid-cols-2 gap-3"
            : "flex-1 min-h-0 min-w-0 flex flex-col gap-3"
        }
      >
        <div className="flex-1 min-h-0 min-w-0 flex flex-col gap-3">
          <div className="flex items-center gap-2 shrink-0">
            <div className="flex-1 min-w-0">
              <FolderPicker label="Folder" path={leftPath} onBrowse={browseLeft} />
            </div>
            {splitButtons}
          </div>
          <FileExplorer
            ref={leftRef}
            rootPath={leftPath}
            rootLabel={leftPath.split("/").pop() || leftPath}
            allowParentNavigation
            allowDelete
            paneId="left"
            onExternalDrop={() => rightRef.current?.reload()}
          />
        </div>
        <div className="flex-1 min-h-0 min-w-0 flex flex-col gap-3">
          <FolderPicker label="Folder" path={rightPath} onBrowse={browseRight} />
          {rightPath ? (
            <FileExplorer
              ref={rightRef}
              rootPath={rightPath}
              rootLabel={rightPath.split("/").pop() || rightPath}
              allowParentNavigation
              allowDelete
              paneId="right"
              onExternalDrop={() => leftRef.current?.reload()}
            />
          ) : (
            <div className="flex-1 flex items-center justify-center bg-bg-secondary border border-border rounded-2xl">
              <div className="text-center">
                <p className="text-text-tertiary text-xs mb-3">Choose a folder for the second pane</p>
                <button
                  onClick={browseRight}
                  className="px-4 py-2 bg-bg-card border border-border text-text-secondary rounded-xl text-xs font-medium hover:border-border-active transition-all"
                >
                  Browse...
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
