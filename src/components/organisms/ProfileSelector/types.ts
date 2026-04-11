import type { Profile } from "../../../types/profiles";

export interface ProfileSelectorProps {
  profiles: Profile[];
  activeProfile: Profile | null;
  onSwitch: (name: string) => void;
  onCreate: (name: string) => void;
  onDelete: (name: string) => void;
  onToggleFilters: () => void;
  filterCount: number;
  isDirty?: boolean;
  onSave?: () => void;
  onDiscard?: () => void;
}
