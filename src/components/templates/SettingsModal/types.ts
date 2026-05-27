export interface SettingsModalProps {
  onClose: () => void;
  onLibraryChanged: () => void;
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
