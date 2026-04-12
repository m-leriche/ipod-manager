export interface FolderPickerProps {
  label: string;
  path: string | null;
  onBrowse: () => void;
  disabled?: boolean;
  placeholder?: string;
}
