export interface Profile {
  name: string;
  source_path: string | null;
  target_path: string | null;
  exclusions: string[];
}

export interface ProfileStore {
  profiles: Profile[];
}

export interface ContextMenuItem {
  label: string;
  onClick: () => void;
}
