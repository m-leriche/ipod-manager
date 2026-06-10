export interface SettingsModalProps {
  onClose: () => void;
  onLibraryChanged: () => void;
  autoCheckUpdate?: boolean;
}

export type SettingsSection = "general" | "appearance" | "playback" | "library" | "shortcuts" | "connections";

export interface SettingsSectionDef {
  id: SettingsSection;
  label: string;
}

export interface ServerUrl {
  label: string;
  url: string;
}

export interface SubsonicStatus {
  enabled: boolean;
  port: number;
  username: string;
  urls: ServerUrl[];
  localhost_only: boolean;
}
