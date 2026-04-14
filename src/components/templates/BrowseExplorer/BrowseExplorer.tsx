import { useState, useRef } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { FolderPicker } from "../../atoms/FolderPicker/FolderPicker";
import { FileExplorer } from "../../organisms/FileExplorer/FileExplorer";
import type { FileExplorerHandle } from "../../organisms/FileExplorer/types";
import type { PaneLayout } from "./types";

export const BrowseExplorer = () => {
  const [leftPath, setLeftPath] = useState<string | null>(null);
  const [rightPath, setRightPath] = useState<string | null>(null);
  const [dualPane, setDualPane] = useState(false);
  const [layout, setLayout] = useState<PaneLayout>("horizontal");

  const leftRef = useRef<FileExplorerHandle>(null);
  const rightRef = useRef<FileExplorerHandle>(null);

  const browseLeft = async () => {
    const picked = await open({ directory: true, multiple: false, title: "Select folder to explore" });
    if (picked) setLeftPath(picked as string);
  };

  const browseRight = async () => {
    const picked = await open({ directory: true, multiple: false, title: "Select folder to explore" });
    if (picked) setRightPath(picked as string);
  };

  // No left folder selected — show initial prompt
  if (!leftPath) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center max-w-sm">
          <p className="text-text-tertiary text-xs mb-4">Choose a folder to explore its contents</p>
          <div className="mb-4">
            <FolderPicker label="Folder" path={null} onBrowse={browseLeft} />
          </div>
        </div>
      </div>
    );
  }

  const splitButtons = (
    <div className="flex gap-1 shrink-0">
      <button
        onClick={() => setDualPane((v) => !v)}
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
          onClick={() => setLayout((l) => (l === "horizontal" ? "vertical" : "horizontal"))}
          className="px-2.5 py-1.5 bg-bg-card border border-border text-text-tertiary rounded-lg text-[11px] font-medium hover:text-text-secondary hover:border-border-active transition-all"
          title={layout === "horizontal" ? "Stack vertically" : "Side by side"}
        >
          {layout === "horizontal" ? "⬍" : "⬌"}
        </button>
      )}
    </div>
  );

  if (!dualPane) {
    return (
      <div className="flex-1 min-w-0 flex flex-col gap-3 min-h-0">
        <div className="flex items-center gap-2 shrink-0">
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
  );
};
