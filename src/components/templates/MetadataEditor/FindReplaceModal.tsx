import { useState, useEffect, useMemo } from "react";
import type { TrackMetadata } from "../../../types/metadata";
import type { EditableFields } from "./types";
import { STRING_FIELDS, previewFindReplace } from "./batchOperations";
import type { StringField, FieldChange } from "./batchOperations";
import { fieldLabel } from "./helpers";

const PREVIEW_LIMIT = 50;

/** Delay before re-running the (possibly expensive) preview while typing. */
const PREVIEW_DEBOUNCE_MS = 150;

interface FindReplaceModalProps {
  tracks: TrackMetadata[];
  editedTracks: Record<string, EditableFields>;
  targetLabel: string;
  onApply: (changes: FieldChange[]) => void;
  onClose: () => void;
}

export const FindReplaceModal = ({ tracks, editedTracks, targetLabel, onApply, onClose }: FindReplaceModalProps) => {
  const [fields, setFields] = useState<Set<StringField>>(new Set<StringField>(["title"]));
  const [find, setFind] = useState("");
  const [replace, setReplace] = useState("");
  const [useRegex, setUseRegex] = useState(false);
  const [caseSensitive, setCaseSensitive] = useState(false);

  // Debounce the typed pattern so the preview (user regex × every field of
  // every target track) doesn't run synchronously on each keystroke.
  const [debouncedFind, setDebouncedFind] = useState("");
  const [debouncedReplace, setDebouncedReplace] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedFind(find);
      setDebouncedReplace(replace);
    }, PREVIEW_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [find, replace]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const changes = useMemo(
    () =>
      previewFindReplace(tracks, editedTracks, {
        fields: [...fields],
        find: debouncedFind,
        replace: debouncedReplace,
        useRegex,
        caseSensitive,
      }),
    [tracks, editedTracks, fields, debouncedFind, debouncedReplace, useRegex, caseSensitive],
  );

  const invalidPattern = changes === null;

  const toggleField = (field: StringField) => {
    setFields((prev) => {
      const next = new Set(prev);
      if (next.has(field)) next.delete(field);
      else next.add(field);
      return next;
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} data-testid="find-replace-backdrop" />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="find-replace-title"
        className="relative bg-bg-secondary border border-border rounded-2xl shadow-xl w-[560px] max-w-[95vw] max-h-[85vh] flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <h2 id="find-replace-title" className="text-sm font-medium text-text-primary">
            Find &amp; Replace
          </h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-text-tertiary hover:text-text-primary transition-colors text-lg leading-none"
          >
            &times;
          </button>
        </div>

        {/* Form */}
        <div className="px-5 py-4 space-y-4 shrink-0">
          <p className="text-[10px] text-text-tertiary">
            Applies to {targetLabel}. Changes are staged for review — nothing is written until you save.
          </p>

          <div className="flex gap-3">
            <label className="flex-1 flex flex-col gap-1">
              <span className="text-[10px] font-medium text-text-tertiary uppercase tracking-widest">Find</span>
              <input
                type="text"
                value={find}
                onChange={(e) => setFind(e.target.value)}
                placeholder={useRegex ? "e.g. \\s*\\(Remaster(ed)?\\)" : "Text to find"}
                className="bg-bg-card border border-border rounded-lg px-3 py-2 text-xs text-text-primary placeholder:text-text-tertiary focus:border-border-active outline-none"
                data-testid="find-input"
                autoFocus
              />
            </label>
            <label className="flex-1 flex flex-col gap-1">
              <span className="text-[10px] font-medium text-text-tertiary uppercase tracking-widest">Replace with</span>
              <input
                type="text"
                value={replace}
                onChange={(e) => setReplace(e.target.value)}
                placeholder={useRegex ? "Use $1 for groups" : "Replacement text"}
                className="bg-bg-card border border-border rounded-lg px-3 py-2 text-xs text-text-primary placeholder:text-text-tertiary focus:border-border-active outline-none"
                data-testid="replace-input"
              />
            </label>
          </div>

          <div className="flex items-center gap-4">
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={useRegex}
                onChange={(e) => setUseRegex(e.target.checked)}
                className="accent-accent w-3 h-3"
                data-testid="regex-toggle"
              />
              <span className="text-[11px] text-text-secondary">Regular expression</span>
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={caseSensitive}
                onChange={(e) => setCaseSensitive(e.target.checked)}
                className="accent-accent w-3 h-3"
                data-testid="case-toggle"
              />
              <span className="text-[11px] text-text-secondary">Case sensitive</span>
            </label>
          </div>

          <div>
            <span className="text-[10px] font-medium text-text-tertiary uppercase tracking-widest block mb-2">
              In fields
            </span>
            <div className="flex flex-wrap gap-x-4 gap-y-2">
              {STRING_FIELDS.map((field) => (
                <label key={field} className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={fields.has(field)}
                    onChange={() => toggleField(field)}
                    className="accent-accent w-3 h-3"
                    data-testid={`field-toggle-${field}`}
                  />
                  <span className="text-[11px] text-text-secondary">{fieldLabel(field)}</span>
                </label>
              ))}
            </div>
          </div>
        </div>

        {/* Preview */}
        <div className="flex-1 min-h-0 px-5 pb-2 flex flex-col">
          <span className="text-[10px] font-medium text-text-tertiary uppercase tracking-widest block mb-2">
            Preview
          </span>
          <div className="flex-1 min-h-[80px] overflow-y-auto border border-border rounded-xl">
            {invalidPattern ? (
              <div className="px-4 py-3 text-[11px] text-danger" role="alert">
                Invalid regular expression
              </div>
            ) : debouncedFind === "" ? (
              <div className="px-4 py-3 text-[11px] text-text-tertiary">Enter text to find</div>
            ) : changes.length === 0 ? (
              <div className="px-4 py-3 text-[11px] text-text-tertiary">No matches in the selected fields</div>
            ) : (
              <div className="divide-y divide-border" data-testid="find-replace-preview">
                {changes.slice(0, PREVIEW_LIMIT).map((c) => (
                  <div key={`${c.filePath}-${c.field}`} className="px-4 py-2 flex items-baseline gap-2 text-[11px]">
                    <span className="text-text-tertiary shrink-0 w-24 truncate" title={c.fileName}>
                      {c.fileName}
                    </span>
                    <span className="text-text-tertiary shrink-0">{fieldLabel(c.field)}:</span>
                    <span className="text-text-secondary line-through truncate min-w-0">{c.before}</span>
                    <span className="text-text-tertiary shrink-0">→</span>
                    <span className="text-text-primary truncate min-w-0">{c.after || "(empty)"}</span>
                  </div>
                ))}
                {changes.length > PREVIEW_LIMIT && (
                  <div className="px-4 py-2 text-[10px] text-text-tertiary">
                    …and {changes.length - PREVIEW_LIMIT} more
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="px-5 py-4 border-t border-border flex items-center justify-end gap-2 shrink-0">
          {!invalidPattern && changes.length > 0 && (
            <span className="text-[11px] text-text-tertiary mr-auto">
              {changes.length} change{changes.length === 1 ? "" : "s"}
            </span>
          )}
          <button
            onClick={onClose}
            className="px-3 py-1.5 bg-bg-card border border-border text-text-secondary rounded-lg text-[11px] font-medium hover:text-text-primary hover:border-border-active transition-all"
          >
            Cancel
          </button>
          <button
            onClick={() => {
              if (changes && changes.length > 0) onApply(changes);
            }}
            disabled={invalidPattern || !changes || changes.length === 0}
            className="px-3 py-1.5 bg-text-primary text-bg-primary rounded-lg text-[11px] font-medium hover:not-disabled:opacity-90 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
            data-testid="apply-find-replace"
          >
            Stage Changes
          </button>
        </div>
      </div>
    </div>
  );
};
