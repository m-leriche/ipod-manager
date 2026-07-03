import { useState, useEffect, useCallback, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ProfileSelector } from "../../organisms/ProfileSelector/ProfileSelector";
import { FilterPanel } from "../../organisms/FilterPanel/FilterPanel";
import { BrowseExplorer } from "../BrowseExplorer/BrowseExplorer";
import { SyncManager } from "../SyncManager/SyncManager";
import { useToast } from "../../../contexts/ToastContext";
import { emptyFileManagerProfile } from "./helpers";
import type { FileManagerProfile, FileManagerProfileStore } from "../../../types/profiles";
import type { FileManagerMode } from "./types";

export const FileManager = () => {
  const [profileStore, setProfileStore] = useState<FileManagerProfileStore>({ profiles: [] });
  const [activeProfileName, setActiveProfileName] = useState<string | null>(null);
  const [localProfile, setLocalProfile] = useState<FileManagerProfile>(emptyFileManagerProfile("", "browse"));
  const [showFilters, setShowFilters] = useState(false);
  const toast = useToast();

  // Derive mode from the local profile — single source of truth
  const mode: FileManagerMode = localProfile.mode;

  const savedProfile = useMemo(
    () => profileStore.profiles.find((p) => p.name === activeProfileName) ?? null,
    [profileStore, activeProfileName],
  );

  const isDirty = useMemo(() => {
    if (!savedProfile) return false;
    return (
      localProfile.left_path !== savedProfile.left_path ||
      localProfile.right_path !== savedProfile.right_path ||
      localProfile.dual_pane !== savedProfile.dual_pane ||
      localProfile.layout !== savedProfile.layout ||
      localProfile.mode !== savedProfile.mode ||
      localProfile.transcode_lossless !== savedProfile.transcode_lossless ||
      localProfile.transcode_bitrate !== savedProfile.transcode_bitrate ||
      JSON.stringify(localProfile.exclusions) !== JSON.stringify(savedProfile.exclusions)
    );
  }, [localProfile, savedProfile]);

  const save = useCallback(
    (store: FileManagerProfileStore) => {
      setProfileStore(store);
      invoke("save_file_manager_profiles", { store }).catch((e) => toast.error(`Failed to save profiles: ${e}`));
    },
    [toast],
  );

  // Load profiles on mount
  useEffect(() => {
    invoke<FileManagerProfileStore>("get_file_manager_profiles")
      .then((store) => {
        setProfileStore(store);
        if (store.active_profile) {
          setActiveProfileName(store.active_profile);
        }
      })
      .catch((e) => toast.error(`Failed to load profiles: ${e}`));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync local profile when a saved profile is active
  useEffect(() => {
    if (savedProfile) {
      setLocalProfile({ ...savedProfile });
    }
  }, [savedProfile]);

  // ── Profile operations ──────────────────────────────────────────

  const switchProfile = (name: string) => {
    const profileName = name || null;
    setActiveProfileName(profileName);
    setShowFilters(false);
    if (!profileName) {
      setLocalProfile(emptyFileManagerProfile("", mode));
    }
    save({ ...profileStore, active_profile: profileName });
  };

  const createProfile = (name: string) => {
    if (profileStore.profiles.some((p) => p.name === name)) return;
    const newProfile = { ...localProfile, name };
    save({ profiles: [...profileStore.profiles, newProfile], active_profile: name });
    setActiveProfileName(name);
  };

  const deleteProfile = (name: string) => {
    const newActive = activeProfileName === name ? null : activeProfileName;
    save({ profiles: profileStore.profiles.filter((p) => p.name !== name), active_profile: newActive });
    if (activeProfileName === name) {
      setActiveProfileName(null);
      setLocalProfile(emptyFileManagerProfile("", "browse"));
      setShowFilters(false);
    }
  };

  const renameProfile = (oldName: string, newName: string) => {
    save({
      profiles: profileStore.profiles.map((p) => (p.name === oldName ? { ...p, name: newName } : p)),
      active_profile: activeProfileName === oldName ? newName : activeProfileName,
    });
    if (activeProfileName === oldName) {
      setActiveProfileName(newName);
      setLocalProfile({ ...localProfile, name: newName });
    }
  };

  const duplicateProfile = (sourceName: string, newName: string) => {
    const source = profileStore.profiles.find((p) => p.name === sourceName);
    if (!source) return;
    const copy = { ...source, name: newName };
    save({ profiles: [...profileStore.profiles, copy], active_profile: newName });
    setActiveProfileName(newName);
    setLocalProfile({ ...copy });
  };

  const saveProfile = () => {
    if (!activeProfileName) return;
    save({
      profiles: profileStore.profiles.map((p) => (p.name === localProfile.name ? { ...localProfile } : p)),
      active_profile: activeProfileName,
    });
  };

  const discardChanges = () => {
    if (savedProfile) {
      setLocalProfile({ ...savedProfile });
    }
  };

  // ── Local profile mutations ─────────────────────────────────────

  const updateLocal = (patch: Partial<FileManagerProfile>) => {
    setLocalProfile({ ...localProfile, ...patch });
  };

  const handleModeChange = (newMode: FileManagerMode) => {
    updateLocal({ mode: newMode });
  };

  // ── Render ──────────────────────────────────────────────────────

  const exclusions = localProfile.exclusions;

  const modeToggle = (
    <div className="flex gap-0.5 bg-bg-primary/50 rounded-lg p-0.5">
      {(["browse", "sync"] as const).map((m) => (
        <button
          key={m}
          onClick={() => handleModeChange(m)}
          className={`px-3 py-1 rounded-md text-[11px] font-medium transition-all ${
            mode === m ? "bg-bg-card text-text-primary shadow-sm" : "text-text-tertiary hover:text-text-secondary"
          }`}
        >
          {m === "browse" ? "Browse" : "Sync"}
        </button>
      ))}
    </div>
  );

  return (
    <div className="flex-1 min-w-0 flex flex-col gap-3 min-h-0">
      {/* Profile bar */}
      <div className="bg-bg-secondary border border-border rounded-2xl px-5 py-3 shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <ProfileSelector
              profiles={profileStore.profiles}
              activeProfile={activeProfileName ? localProfile : null}
              onSwitch={switchProfile}
              onCreate={createProfile}
              onDelete={deleteProfile}
              onRename={renameProfile}
              onDuplicate={duplicateProfile}
              onToggleFilters={mode === "sync" && exclusions.length > 0 ? () => setShowFilters((v) => !v) : undefined}
              filterCount={mode === "sync" ? exclusions.length : undefined}
              isDirty={isDirty}
              onSave={saveProfile}
              onDiscard={discardChanges}
            />
          </div>
          {modeToggle}
        </div>
      </div>

      {/* Sync exclusion filters */}
      {mode === "sync" && showFilters && exclusions.length > 0 && (
        <FilterPanel
          exclusions={exclusions}
          onRemove={(path) => updateLocal({ exclusions: exclusions.filter((e) => e !== path) })}
        />
      )}

      {mode === "browse" ? (
        <BrowseExplorer
          leftPath={localProfile.left_path}
          rightPath={localProfile.right_path}
          dualPane={localProfile.dual_pane}
          layout={localProfile.layout ?? "horizontal"}
          onLeftPathChange={(path) => updateLocal({ left_path: path })}
          onRightPathChange={(path) => updateLocal({ right_path: path })}
          onDualPaneChange={(v) => updateLocal({ dual_pane: v })}
          onLayoutChange={(v) => updateLocal({ layout: v })}
        />
      ) : (
        <SyncManager
          sourcePath={localProfile.left_path}
          targetPath={localProfile.right_path}
          exclusions={exclusions}
          transcodeLossless={localProfile.transcode_lossless}
          transcodeBitrate={localProfile.transcode_bitrate}
          onSourcePathChange={(path) => updateLocal({ left_path: path })}
          onTargetPathChange={(path) => updateLocal({ right_path: path })}
          onExclusionsChange={(ex) => updateLocal({ exclusions: ex })}
          onTranscodeLosslessChange={(v) => updateLocal({ transcode_lossless: v })}
          onTranscodeBitrateChange={(v) => updateLocal({ transcode_bitrate: v })}
        />
      )}
    </div>
  );
};
