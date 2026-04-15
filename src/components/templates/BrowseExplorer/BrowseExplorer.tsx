import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { FolderPicker } from "../../atoms/FolderPicker/FolderPicker";
import { FileExplorer } from "../../organisms/FileExplorer/FileExplorer";
import { ProfileSelector } from "../../organisms/ProfileSelector/ProfileSelector";
import type { FileExplorerHandle } from "../../organisms/FileExplorer/types";
import type { BrowseProfile, BrowseProfileStore } from "../../../types/profiles";
import type { PaneLayout } from "./types";

export const BrowseExplorer = () => {
  // Core explorer state — works without profiles
  const [leftPath, setLeftPath] = useState<string | null>(null);
  const [rightPath, setRightPath] = useState<string | null>(null);
  const [dualPane, setDualPane] = useState(false);
  const [layout, setLayout] = useState<PaneLayout>("horizontal");

  // Profile system — optional persistence layer
  const [profileStore, setProfileStore] = useState<BrowseProfileStore>({ profiles: [] });
  const [activeProfileName, setActiveProfileName] = useState<string | null>(null);

  const leftRef = useRef<FileExplorerHandle>(null);
  const rightRef = useRef<FileExplorerHandle>(null);

  const savedProfile = useMemo(
    () => profileStore.profiles.find((p) => p.name === activeProfileName) ?? null,
    [profileStore, activeProfileName],
  );

  const isDirty = useMemo(() => {
    if (!savedProfile) return false;
    return (
      leftPath !== (savedProfile.left_path ?? null) ||
      rightPath !== (savedProfile.right_path ?? null) ||
      dualPane !== savedProfile.dual_pane ||
      layout !== savedProfile.layout
    );
  }, [savedProfile, leftPath, rightPath, dualPane, layout]);

  // Single save function — all writes go through here to avoid races
  const save = useCallback((store: BrowseProfileStore) => {
    setProfileStore(store);
    invoke("save_browse_profiles", { store }).catch((e) => console.error("Failed to save browse profiles:", e));
  }, []);

  // Load profiles and restore last active profile on mount
  useEffect(() => {
    invoke<BrowseProfileStore>("get_browse_profiles")
      .then((store) => {
        setProfileStore(store);
        const active = store.profiles.find((p) => p.name === store.active_profile);
        if (active) {
          setActiveProfileName(active.name);
          setLeftPath(active.left_path ?? null);
          setRightPath(active.right_path ?? null);
          setDualPane(active.dual_pane);
          setLayout((active.layout as PaneLayout) ?? "horizontal");
        }
      })
      .catch(() => {});
  }, []);

  const switchProfile = (name: string) => {
    const profileName = name || null;
    setActiveProfileName(profileName);
    const profile = profileStore.profiles.find((p) => p.name === name);
    if (profile) {
      setLeftPath(profile.left_path ?? null);
      setRightPath(profile.right_path ?? null);
      setDualPane(profile.dual_pane);
      setLayout((profile.layout as PaneLayout) ?? "horizontal");
    } else {
      setLeftPath(null);
      setRightPath(null);
      setDualPane(false);
      setLayout("horizontal");
    }
    save({ ...profileStore, active_profile: profileName });
  };

  const createProfile = (name: string) => {
    if (profileStore.profiles.some((p) => p.name === name)) return;
    const newProfile: BrowseProfile = {
      name,
      left_path: null,
      right_path: null,
      dual_pane: false,
      layout: "horizontal",
    };
    save({ profiles: [...profileStore.profiles, newProfile], active_profile: name });
    setActiveProfileName(name);
    setLeftPath(null);
    setRightPath(null);
    setDualPane(false);
    setLayout("horizontal");
  };

  const deleteProfile = (name: string) => {
    const newActive = activeProfileName === name ? null : activeProfileName;
    save({ profiles: profileStore.profiles.filter((p) => p.name !== name), active_profile: newActive });
    if (activeProfileName === name) {
      setActiveProfileName(null);
      setLeftPath(null);
      setRightPath(null);
      setDualPane(false);
      setLayout("horizontal");
    }
  };

  const saveProfile = () => {
    if (!activeProfileName) return;
    const updated: BrowseProfile = {
      name: activeProfileName,
      left_path: leftPath,
      right_path: rightPath,
      dual_pane: dualPane,
      layout,
    };
    save({
      profiles: profileStore.profiles.map((p) => (p.name === activeProfileName ? updated : p)),
      active_profile: activeProfileName,
    });
  };

  const renameProfile = (oldName: string, newName: string) => {
    save({
      profiles: profileStore.profiles.map((p) => (p.name === oldName ? { ...p, name: newName } : p)),
      active_profile: activeProfileName === oldName ? newName : activeProfileName,
    });
    if (activeProfileName === oldName) setActiveProfileName(newName);
  };

  const duplicateProfile = (sourceName: string, newName: string) => {
    const source = profileStore.profiles.find((p) => p.name === sourceName);
    if (!source) return;
    const copy: BrowseProfile = { ...source, name: newName };
    save({ profiles: [...profileStore.profiles, copy], active_profile: newName });
    setActiveProfileName(newName);
    setLeftPath(copy.left_path ?? null);
    setRightPath(copy.right_path ?? null);
    setDualPane(copy.dual_pane);
    setLayout((copy.layout as PaneLayout) ?? "horizontal");
  };

  const discardChanges = () => {
    if (!savedProfile) return;
    setLeftPath(savedProfile.left_path ?? null);
    setRightPath(savedProfile.right_path ?? null);
    setDualPane(savedProfile.dual_pane);
    setLayout((savedProfile.layout as PaneLayout) ?? "horizontal");
  };

  const browseLeft = async () => {
    const picked = await open({ directory: true, multiple: false, title: "Select folder to explore" });
    if (picked) setLeftPath(picked as string);
  };

  const browseRight = async () => {
    const picked = await open({ directory: true, multiple: false, title: "Select folder to explore" });
    if (picked) setRightPath(picked as string);
  };

  // ── Render ───────────────────────────────────────────────────────

  const activeProfile = activeProfileName ? { name: activeProfileName } : null;

  const profileBar = (
    <div className="bg-bg-secondary border border-border rounded-2xl px-5 py-3 shrink-0">
      <ProfileSelector
        profiles={profileStore.profiles}
        activeProfile={activeProfile}
        onSwitch={switchProfile}
        onCreate={createProfile}
        onDelete={deleteProfile}
        onRename={renameProfile}
        onDuplicate={duplicateProfile}
        isDirty={isDirty}
        onSave={saveProfile}
        onDiscard={discardChanges}
      />
    </div>
  );

  // No left folder selected — show initial prompt
  if (!leftPath) {
    return (
      <div className="flex-1 min-w-0 flex flex-col gap-3 min-h-0">
        {profileBar}
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center max-w-sm">
            <p className="text-text-tertiary text-xs mb-4">Choose a folder to explore its contents</p>
            <div className="mb-4">
              <FolderPicker label="Folder" path={null} onBrowse={browseLeft} />
            </div>
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
          {layout === "horizontal" ? "\u2B0D" : "\u2B0C"}
        </button>
      )}
    </div>
  );

  if (!dualPane) {
    return (
      <div className="flex-1 min-w-0 flex flex-col gap-3 min-h-0">
        {profileBar}
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
    <div className="flex-1 min-w-0 flex flex-col gap-3 min-h-0">
      {profileBar}
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
