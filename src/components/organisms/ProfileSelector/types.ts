export interface ProfileSelectorProps {
  profiles: { name: string }[];
  activeProfile: { name: string } | null;
  onSwitch: (name: string) => void;
  onCreate: (name: string) => void;
  onDelete: (name: string) => void;
  onRename?: (oldName: string, newName: string) => void;
  onDuplicate?: (sourceName: string, newName: string) => void;
  onToggleFilters?: () => void;
  filterCount?: number;
  isDirty?: boolean;
  onSave?: () => void;
  onDiscard?: () => void;
}
