import { useState, useEffect, useRef } from "react";

interface InlineRenameInputProps {
  initialName: string;
  isDir: boolean;
  onConfirm: (newName: string) => void;
  onCancel: () => void;
}

export const InlineRenameInput = ({ initialName, isDir, onConfirm, onCancel }: InlineRenameInputProps) => {
  const [value, setValue] = useState(initialName);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!inputRef.current) return;
    inputRef.current.focus();
    // Select name without extension for files, full name for folders
    const dotIndex = initialName.lastIndexOf(".");
    const end = !isDir && dotIndex > 0 ? dotIndex : initialName.length;
    inputRef.current.setSelectionRange(0, end);
  }, [initialName, isDir]);

  const confirm = () => {
    const trimmed = value.trim();
    if (!trimmed || trimmed === initialName) {
      onCancel();
      return;
    }
    onConfirm(trimmed);
  };

  return (
    <input
      ref={inputRef}
      type="text"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter") confirm();
        if (e.key === "Escape") onCancel();
      }}
      onBlur={confirm}
      onClick={(e) => e.stopPropagation()}
      className="bg-bg-card border border-accent rounded px-1.5 py-0.5 text-xs text-text-primary outline-none w-full max-w-[300px]"
    />
  );
};
