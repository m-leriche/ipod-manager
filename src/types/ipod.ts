export interface IpodInfo {
  volume_name: string;
  identifier: string;
  mount_point: string;
  total_space: number;
  used_space: number;
  free_space: number;
  format: string;

  serial_number: string | null;
  model_number: string | null;
  model_name: string | null;
  firmware_version: string | null;

  rockbox_version: string | null;
  has_rockbox: boolean;

  audio_space: number;
  other_space: number;

  rockbox_track_count: number | null;
}
