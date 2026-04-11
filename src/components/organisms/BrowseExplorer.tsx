import { useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { FolderPicker } from "../atoms/FolderPicker";
import { FileExplorer } from "../FileExplorer";

export function BrowseExplorer() {
  const [rootPath, setRootPath] = useState<string | null>(null);

  const browse = async () => {
    const picked = await open({ directory: true, multiple: false, title: "Select folder to explore" });
    if (picked) setRootPath(picked as string);
  };

  if (!rootPath) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center max-w-sm">
          <p className="text-text-tertiary text-xs mb-4">
            Choose a folder to explore its contents
          </p>
          <div className="mb-4">
            <FolderPicker label="Folder" path={null} onBrowse={browse} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 min-w-0 flex flex-col gap-2.5 min-h-0">
      <FolderPicker label="Folder" path={rootPath} onBrowse={browse} />
      <FileExplorer
        rootPath={rootPath}
        rootLabel={rootPath.split("/").pop() || rootPath}
        allowParentNavigation
        allowDelete
      />
    </div>
  );
}
