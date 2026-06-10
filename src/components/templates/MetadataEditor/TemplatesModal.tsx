import { useState, useEffect, useCallback } from "react";
import type { MetadataTemplate } from "../../../types/metadata";
import { TEMPLATE_FIELDS } from "./batchOperations";
import { fieldLabel } from "./helpers";
import { getSetting, setSetting } from "../../../utils/settings";

interface TemplatesModalProps {
  targetLabel: string;
  onApply: (template: MetadataTemplate) => void;
  onClose: () => void;
}

export const TemplatesModal = ({ targetLabel, onApply, onClose }: TemplatesModalProps) => {
  const [templates, setTemplates] = useState<MetadataTemplate[]>(() => getSetting("metadataTemplates"));
  const [creating, setCreating] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // New-template form state
  const [name, setName] = useState("");
  const [draftFields, setDraftFields] = useState<Record<string, string>>({});

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const persist = useCallback((next: MetadataTemplate[]) => {
    setTemplates(next);
    setSetting("metadataTemplates", next);
  }, []);

  const handleCreate = useCallback(() => {
    const fields = Object.fromEntries(Object.entries(draftFields).filter(([, v]) => v.trim() !== ""));
    if (name.trim() === "" || Object.keys(fields).length === 0) return;
    const template: MetadataTemplate = {
      id: crypto.randomUUID(),
      name: name.trim(),
      fields,
    };
    persist([...templates, template]);
    setCreating(false);
    setName("");
    setDraftFields({});
  }, [name, draftFields, templates, persist]);

  const handleDelete = useCallback(
    (id: string) => {
      persist(templates.filter((t) => t.id !== id));
      setConfirmDeleteId(null);
    },
    [templates, persist],
  );

  const canCreate = name.trim() !== "" && Object.values(draftFields).some((v) => v.trim() !== "");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} data-testid="templates-backdrop" />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="templates-title"
        className="relative bg-bg-secondary border border-border rounded-2xl shadow-xl w-[480px] max-w-[95vw] max-h-[85vh] flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <h2 id="templates-title" className="text-sm font-medium text-text-primary">
            Metadata Templates
          </h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-text-tertiary hover:text-text-primary transition-colors text-lg leading-none"
          >
            &times;
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <p className="text-[10px] text-text-tertiary mb-3">
            Apply a saved set of tag values to {targetLabel}. Changes are staged for review — nothing is written until
            you save.
          </p>

          {/* Saved templates */}
          {templates.length > 0 ? (
            <div className="flex flex-col border border-border rounded-xl overflow-hidden divide-y divide-border mb-4">
              {templates.map((t) => (
                <div key={t.id} className="flex items-center gap-3 px-4 py-2.5">
                  <div className="flex-1 min-w-0">
                    <span className="text-[11px] font-medium text-text-primary block truncate">{t.name}</span>
                    <span className="text-[10px] text-text-tertiary block truncate">
                      {Object.entries(t.fields)
                        .map(([f, v]) => `${fieldLabel(f)}: ${v}`)
                        .join(" · ")}
                    </span>
                  </div>
                  {confirmDeleteId === t.id ? (
                    <button
                      onClick={() => handleDelete(t.id)}
                      onBlur={() => setConfirmDeleteId(null)}
                      className="text-[10px] text-danger font-medium transition-colors shrink-0"
                      data-testid={`confirm-delete-template-${t.id}`}
                    >
                      Confirm?
                    </button>
                  ) : (
                    <button
                      onClick={() => setConfirmDeleteId(t.id)}
                      className="text-[10px] text-text-tertiary hover:text-danger transition-colors shrink-0"
                      data-testid={`delete-template-${t.id}`}
                    >
                      Delete
                    </button>
                  )}
                  <button
                    onClick={() => onApply(t)}
                    className="px-2.5 py-1 bg-text-primary text-bg-primary rounded-md text-[10px] font-medium hover:opacity-90 transition-all shrink-0"
                    data-testid={`apply-template-${t.id}`}
                  >
                    Apply
                  </button>
                </div>
              ))}
            </div>
          ) : (
            !creating && <p className="text-[11px] text-text-tertiary mb-4">No templates yet.</p>
          )}

          {/* Create form */}
          {creating ? (
            <div className="border border-border rounded-xl px-4 py-3 space-y-3">
              <label className="flex flex-col gap-1">
                <span className="text-[10px] font-medium text-text-tertiary uppercase tracking-widest">
                  Template name
                </span>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Various Artists compilation"
                  className="bg-bg-card border border-border rounded-lg px-3 py-2 text-xs text-text-primary placeholder:text-text-tertiary focus:border-border-active outline-none"
                  data-testid="template-name-input"
                  autoFocus
                />
              </label>

              <div className="space-y-2">
                {TEMPLATE_FIELDS.map((field) => (
                  <label key={field} className="flex items-center gap-2">
                    <span className="text-[11px] text-text-secondary w-28 shrink-0">{fieldLabel(field)}</span>
                    <input
                      type="text"
                      value={draftFields[field] ?? ""}
                      onChange={(e) => setDraftFields((prev) => ({ ...prev, [field]: e.target.value }))}
                      placeholder="Leave empty to skip"
                      className="flex-1 bg-bg-card border border-border rounded-lg px-3 py-1.5 text-xs text-text-primary placeholder:text-text-tertiary focus:border-border-active outline-none"
                      data-testid={`template-field-${field}`}
                    />
                  </label>
                ))}
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <button
                  onClick={() => {
                    setCreating(false);
                    setName("");
                    setDraftFields({});
                  }}
                  className="px-3 py-1.5 bg-bg-card border border-border text-text-secondary rounded-lg text-[11px] font-medium hover:text-text-primary hover:border-border-active transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreate}
                  disabled={!canCreate}
                  className="px-3 py-1.5 bg-text-primary text-bg-primary rounded-lg text-[11px] font-medium hover:not-disabled:opacity-90 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                  data-testid="save-template"
                >
                  Save Template
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setCreating(true)}
              className="text-[11px] text-accent hover:text-accent-hover transition-colors"
              data-testid="create-template"
            >
              + New Template
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
