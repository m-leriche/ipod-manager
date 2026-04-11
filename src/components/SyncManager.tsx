import { useState, useEffect, useCallback, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { ComparisonView } from "./ComparisonView";
import { FolderPicker } from "./atoms/FolderPicker";
import { ProfileSelector } from "./organisms/ProfileSelector";
import { FilterPanel } from "./organisms/FilterPanel";
import type { Profile, ProfileStore } from "../types/profiles";

function emptyProfile(name: string): Profile {
  return { name, source_path: null, target_path: null, exclusions: [] };
}

export function SyncManager() {
  const [comparing, setComparing] = useState(false);
  const [profileStore, setProfileStore] = useState<ProfileStore>({ profiles: [] });
  const [activeProfileName, setActiveProfileName] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);

  // Local working copy of the active profile (may have unsaved changes)
  const [localProfile, setLocalProfile] = useState<Profile | null>(null);

  // The saved version of the active profile (from the store)
  const savedProfile = useMemo(
    () => profileStore.profiles.find((p) => p.name === activeProfileName) ?? null,
    [profileStore, activeProfileName],
  );

  // Dirty check: compare local working copy against saved version
  const isDirty = useMemo(() => {
    if (!localProfile || !savedProfile) return false;
    return (
      localProfile.source_path !== savedProfile.source_path ||
      localProfile.target_path !== savedProfile.target_path ||
      JSON.stringify(localProfile.exclusions) !== JSON.stringify(savedProfile.exclusions)
    );
  }, [localProfile, savedProfile]);

  const sourceFolder = localProfile?.source_path ?? null;
  const targetFolder = localProfile?.target_path ?? null;
  const exclusions = localProfile?.exclusions ?? [];

  useEffect(() => {
    invoke<ProfileStore>("get_profiles").then(setProfileStore).catch(() => {});
  }, []);

  // Sync local profile when switching profiles or store changes
  useEffect(() => {
    if (savedProfile) {
      setLocalProfile({ ...savedProfile });
    } else {
      setLocalProfile(null);
    }
  }, [savedProfile]);

  const persistStore = useCallback((store: ProfileStore) => {
    setProfileStore(store);
    invoke("save_profiles", { store }).catch(() => {});
  }, []);

  const switchProfile = (name: string) => {
    setActiveProfileName(name || null);
    setShowFilters(false);
    setComparing(false);
  };

  const createProfile = (name: string) => {
    if (profileStore.profiles.some((p) => p.name === name)) return;
    const newProfile = emptyProfile(name);
    const updated = { profiles: [...profileStore.profiles, newProfile] };
    persistStore(updated);
    setActiveProfileName(name);
  };

  const deleteProfile = (name: string) => {
    const updated = { profiles: profileStore.profiles.filter((p) => p.name !== name) };
    persistStore(updated);
    if (activeProfileName === name) {
      setActiveProfileName(null);
      setLocalProfile(null);
    }
    setShowFilters(false);
    setComparing(false);
  };

  // Local mutations (unsaved until user clicks Save)
  const setSourcePath = (path: string) => {
    if (!localProfile) return;
    setLocalProfile({ ...localProfile, source_path: path });
  };

  const setTargetPath = (path: string) => {
    if (!localProfile) return;
    setLocalProfile({ ...localProfile, target_path: path });
  };

  const addExclusion = (path: string) => {
    if (!localProfile || localProfile.exclusions.includes(path)) return;
    setLocalProfile({ ...localProfile, exclusions: [...localProfile.exclusions, path] });
  };

  const removeExclusion = (path: string) => {
    if (!localProfile) return;
    setLocalProfile({
      ...localProfile,
      exclusions: localProfile.exclusions.filter((e) => e !== path),
    });
  };

  const saveProfile = () => {
    if (!localProfile) return;
    const updated = {
      profiles: profileStore.profiles.map((p) =>
        p.name === localProfile.name ? { ...localProfile } : p,
      ),
    };
    persistStore(updated);
  };

  const discardChanges = () => {
    if (savedProfile) setLocalProfile({ ...savedProfile });
  };

  const browse = async (setter: (path: string) => void, title: string) => {
    const picked = await open({ directory: true, multiple: false, title });
    if (picked) setter(picked as string);
  };

  return (
    <div className="flex-1 min-w-0 flex flex-col gap-2.5 min-h-0">
      {/* Profile bar — always visible */}
      <div className="bg-bg-secondary border border-border rounded-2xl px-4 py-2.5 shrink-0">
        <ProfileSelector
          profiles={profileStore.profiles}
          activeProfile={localProfile}
          onSwitch={switchProfile}
          onCreate={createProfile}
          onDelete={deleteProfile}
          onToggleFilters={() => setShowFilters(!showFilters)}
          filterCount={exclusions.length}
          isDirty={isDirty}
          onSave={saveProfile}
          onDiscard={discardChanges}
        />
      </div>

      {showFilters && localProfile && (
        <FilterPanel exclusions={localProfile.exclusions} onRemove={removeExclusion} />
      )}

      {!localProfile ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-text-tertiary text-xs">
            Select or create a profile to start syncing folders
          </p>
        </div>
      ) : comparing && sourceFolder && targetFolder ? (
        <ComparisonView
          sourcePath={sourceFolder}
          targetPath={targetFolder}
          exclusions={exclusions}
          onAddExclusion={addExclusion}
          onBack={() => setComparing(false)}
        />
      ) : (
        <>
          <FolderPicker
            label="Source"
            path={sourceFolder}
            onBrowse={() => browse(setSourcePath, "Select source folder")}
          />
          <FolderPicker
            label="Target"
            path={targetFolder}
            onBrowse={() => browse(setTargetPath, "Select target folder")}
          />
          <button
            disabled={!sourceFolder || !targetFolder}
            onClick={() => setComparing(true)}
            className="px-5 py-2.5 bg-text-primary text-bg-primary rounded-xl text-xs font-medium shrink-0 transition-all hover:not-disabled:opacity-90 disabled:opacity-20 disabled:cursor-not-allowed"
          >
            Compare Folders
          </button>
        </>
      )}
    </div>
  );
}
