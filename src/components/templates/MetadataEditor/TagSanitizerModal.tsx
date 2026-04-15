import { useState, useEffect } from "react";
import type { SanitizeModalOptions, PictureAction } from "./types";

interface TagSanitizerModalProps {
  selectedCount: number;
  onStart: (options: SanitizeModalOptions) => void;
  onClose: () => void;
}

const DEFAULT_RETAIN = "artist,title,album,tracknumber,discnumber,totaltracks,totaldiscs,genre";

export const TagSanitizerModal = ({ selectedCount, onStart, onClose }: TagSanitizerModalProps) => {
  const [retainFields, setRetainFields] = useState(DEFAULT_RETAIN);
  const [pictureAction, setPictureAction] = useState<PictureAction>("retain_front");
  const [coverFilename, setCoverFilename] = useState("folder.jpg");
  const [preserveReplayGain, setPreserveReplayGain] = useState(true);
  const [reduceDateToYear, setReduceDateToYear] = useState(true);
  const [dropDiscForSingle, setDropDiscForSingle] = useState(false);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const handleStart = () => {
    const fields = retainFields
      .split(",")
      .map((f) => f.trim().toLowerCase())
      .filter(Boolean);

    onStart({
      retainFields: fields,
      pictureAction,
      coverFilename,
      preserveReplayGain,
      reduceDateToYear,
      dropDiscForSingle,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-bg-secondary border border-border rounded-2xl shadow-xl w-[480px] max-w-[95vw] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <h2 className="text-sm font-medium text-text-primary">Sanitize Tags</h2>
          <button
            onClick={onClose}
            className="text-text-tertiary hover:text-text-primary transition-colors text-lg leading-none"
          >
            &times;
          </button>
        </div>

        {!confirming ? (
          <>
            {/* Form */}
            <div className="px-5 py-4 space-y-5 overflow-y-auto">
              <p className="text-[11px] text-text-secondary leading-relaxed">
                This clears all tags from your files, selectively preserving only the information you choose.
              </p>

              {/* Fields to retain */}
              <div>
                <label className="text-[10px] font-medium text-text-tertiary uppercase tracking-widest block mb-1.5">
                  Fields to retain (comma-separated)
                </label>
                <input
                  type="text"
                  value={retainFields}
                  onChange={(e) => setRetainFields(e.target.value)}
                  className="w-full px-3 py-2 bg-bg-card border border-border rounded-lg text-xs text-text-primary outline-none focus:border-border-active transition-colors font-mono"
                />
              </div>

              {/* Attached pictures */}
              <div>
                <label className="text-[10px] font-medium text-text-tertiary uppercase tracking-widest block mb-2">
                  Attached pictures
                </label>
                <div className="space-y-2">
                  <RadioOption
                    name="picture"
                    value="clear"
                    checked={pictureAction === "clear"}
                    onChange={() => setPictureAction("clear")}
                    label="Clear all"
                  />
                  <RadioOption
                    name="picture"
                    value="retain_front"
                    checked={pictureAction === "retain_front"}
                    onChange={() => setPictureAction("retain_front")}
                    label="Retain front cover only"
                  />
                  <RadioOption
                    name="picture"
                    value="move_front"
                    checked={pictureAction === "move_front"}
                    onChange={() => setPictureAction("move_front")}
                    label="Move front cover to external file (discard if file exists)"
                  />
                  {pictureAction === "move_front" && (
                    <input
                      type="text"
                      value={coverFilename}
                      onChange={(e) => setCoverFilename(e.target.value)}
                      placeholder="folder.jpg"
                      className="w-full ml-6 px-3 py-1.5 bg-bg-card border border-border rounded-lg text-xs text-text-primary outline-none focus:border-border-active transition-colors"
                      style={{ width: "calc(100% - 24px)" }}
                    />
                  )}
                </div>
              </div>

              {/* Checkboxes */}
              <div className="space-y-2.5">
                <CheckboxOption
                  checked={preserveReplayGain}
                  onChange={setPreserveReplayGain}
                  label="Preserve ReplayGain / SoundCheck"
                />
                <CheckboxOption
                  checked={reduceDateToYear}
                  onChange={setReduceDateToYear}
                  label="Reduce date field to four-digit year"
                />
                <CheckboxOption
                  checked={dropDiscForSingle}
                  onChange={setDropDiscForSingle}
                  label="Drop disc number for single disc albums"
                />
              </div>
            </div>

            {/* Actions */}
            <div className="px-5 py-4 border-t border-border flex justify-end gap-2 shrink-0">
              <button
                onClick={onClose}
                className="px-4 py-2 bg-bg-card border border-border text-text-secondary rounded-xl text-xs font-medium hover:text-text-primary hover:border-border-active transition-all"
              >
                Cancel
              </button>
              <button
                onClick={() => setConfirming(true)}
                className="px-5 py-2 bg-text-primary text-bg-primary rounded-xl text-xs font-medium hover:opacity-90 transition-all"
              >
                Start
              </button>
            </div>
          </>
        ) : (
          <>
            {/* Confirmation */}
            <div className="px-5 py-6 space-y-4">
              <div className="px-3 py-2.5 rounded-xl text-xs leading-relaxed bg-warning/10 text-warning">
                This will permanently modify tags in {selectedCount} {selectedCount === 1 ? "file" : "files"}. Fields
                not in the retain list will be deleted. This cannot be undone.
              </div>
            </div>

            {/* Confirm actions */}
            <div className="px-5 py-4 border-t border-border flex justify-end gap-2 shrink-0">
              <button
                onClick={() => setConfirming(false)}
                className="px-4 py-2 bg-bg-card border border-border text-text-secondary rounded-xl text-xs font-medium hover:text-text-primary hover:border-border-active transition-all"
              >
                Go Back
              </button>
              <button
                onClick={handleStart}
                className="px-5 py-2 bg-danger text-white rounded-xl text-xs font-medium hover:opacity-90 transition-all"
              >
                Confirm &amp; Start
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

const RadioOption = ({
  name,
  value,
  checked,
  onChange,
  label,
}: {
  name: string;
  value: string;
  checked: boolean;
  onChange: () => void;
  label: string;
}) => (
  <label className="flex items-center gap-2.5 cursor-pointer group">
    <input
      type="radio"
      name={name}
      value={value}
      checked={checked}
      onChange={onChange}
      className="w-3.5 h-3.5 accent-accent shrink-0"
    />
    <span className="text-xs text-text-secondary group-hover:text-text-primary transition-colors">{label}</span>
  </label>
);

const CheckboxOption = ({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) => (
  <label className="flex items-center gap-2.5 cursor-pointer group">
    <input
      type="checkbox"
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
      className="w-3.5 h-3.5 accent-accent rounded shrink-0"
    />
    <span className="text-xs text-text-secondary group-hover:text-text-primary transition-colors">{label}</span>
  </label>
);
