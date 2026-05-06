export interface Profile {
  name: string;
  source_path: string | null;
  target_path: string | null;
  exclusions: string[];
}

export interface ProfileStore {
  profiles: Profile[];
  active_profile?: string | null;
}

export interface BrowseProfile {
  name: string;
  left_path: string | null;
  right_path: string | null;
  dual_pane: boolean;
  layout: "horizontal" | "vertical";
}

export interface BrowseProfileStore {
  profiles: BrowseProfile[];
  active_profile?: string | null;
}

export interface FileManagerProfile {
  name: string;
  mode: "browse" | "sync";
  left_path: string | null;
  right_path: string | null;
  dual_pane: boolean;
  layout: "horizontal" | "vertical";
  exclusions: string[];
}

export interface FileManagerProfileStore {
  profiles: FileManagerProfile[];
  active_profile?: string | null;
}
