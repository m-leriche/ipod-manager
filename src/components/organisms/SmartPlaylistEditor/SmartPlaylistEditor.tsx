import { useState, useCallback } from "react";
import { FIELDS, OPERATORS_BY_TYPE, DEFAULT_RULE } from "./constants";
import type { SmartPlaylistRule, SmartPlaylistRuleGroup } from "../../../types/library";

interface SmartPlaylistEditorProps {
  initialName?: string;
  initialRules?: SmartPlaylistRuleGroup;
  initialSortBy?: string | null;
  initialSortDirection?: string | null;
  initialLimit?: number | null;
  onSave: (
    name: string,
    rules: SmartPlaylistRuleGroup,
    sortBy?: string,
    sortDirection?: string,
    limit?: number,
  ) => void;
  onCancel: () => void;
}

export const SmartPlaylistEditor = ({
  initialName = "",
  initialRules,
  initialSortBy,
  initialSortDirection,
  initialLimit,
  onSave,
  onCancel,
}: SmartPlaylistEditorProps) => {
  const [name, setName] = useState(initialName);
  const [matchType, setMatchType] = useState<"all" | "any">(initialRules?.match ?? "all");
  const [rules, setRules] = useState<SmartPlaylistRule[]>(
    initialRules?.rules?.length ? initialRules.rules : [{ ...DEFAULT_RULE }],
  );
  const [sortBy, setSortBy] = useState(initialSortBy ?? "");
  const [sortDirection, setSortDirection] = useState(initialSortDirection ?? "desc");
  const [limit, setLimit] = useState(initialLimit?.toString() ?? "");

  const updateRule = useCallback((index: number, updates: Partial<SmartPlaylistRule>) => {
    setRules((prev) => prev.map((r, i) => (i === index ? { ...r, ...updates } : r)));
  }, []);

  const addRule = useCallback(() => {
    setRules((prev) => [...prev, { ...DEFAULT_RULE }]);
  }, []);

  const removeRule = useCallback((index: number) => {
    setRules((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== index)));
  }, []);

  const handleFieldChange = useCallback(
    (index: number, field: string) => {
      const fieldDef = FIELDS.find((f) => f.key === field);
      const ops = fieldDef ? OPERATORS_BY_TYPE[fieldDef.type] : [];
      const defaultOp = ops[0]?.key ?? "equals";
      updateRule(index, { field, operator: defaultOp, value: "", value2: undefined });
    },
    [updateRule],
  );

  const handleSave = useCallback(() => {
    const trimmedName = name.trim();
    if (!trimmedName) return;
    const validRules = rules.filter((r) => {
      if (r.operator === "is_true" || r.operator === "is_false") return true;
      return r.value.trim() !== "";
    });
    if (validRules.length === 0) return;

    const ruleGroup: SmartPlaylistRuleGroup = { match: matchType, rules: validRules };
    const parsedLimit = parseInt(limit, 10);
    onSave(
      trimmedName,
      ruleGroup,
      sortBy || undefined,
      sortDirection || undefined,
      parsedLimit > 0 ? parsedLimit : undefined,
    );
  }, [name, matchType, rules, sortBy, sortDirection, limit, onSave]);

  const getFieldType = (field: string) => FIELDS.find((f) => f.key === field)?.type ?? "text";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onCancel} />
      <div className="relative bg-bg-primary border border-border rounded-2xl shadow-2xl w-[520px] max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="px-5 py-4 border-b border-border">
          <h2 className="text-sm font-medium text-text-primary">
            {initialName ? "Edit Smart Playlist" : "New Smart Playlist"}
          </h2>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* Name */}
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Playlist name..."
            className="w-full px-3 py-2 bg-bg-card border border-border rounded-lg text-xs text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-accent"
          />

          {/* Match type */}
          <div className="flex items-center gap-2 text-[11px] text-text-secondary">
            <span>Match</span>
            <select
              value={matchType}
              onChange={(e) => setMatchType(e.target.value as "all" | "any")}
              className="px-2 py-1 bg-bg-card border border-border rounded text-[11px] text-text-primary focus:outline-none"
            >
              <option value="all">all</option>
              <option value="any">any</option>
            </select>
            <span>of the following rules:</span>
          </div>

          {/* Rules */}
          <div className="space-y-2">
            {rules.map((rule, i) => {
              const fieldType = getFieldType(rule.field);
              const operators = OPERATORS_BY_TYPE[fieldType] ?? [];
              const needsValue = rule.operator !== "is_true" && rule.operator !== "is_false";
              const needsValue2 = rule.operator === "between";

              return (
                <div key={i} className="flex items-center gap-1.5">
                  {/* Field */}
                  <select
                    value={rule.field}
                    onChange={(e) => handleFieldChange(i, e.target.value)}
                    className="px-2 py-1.5 bg-bg-card border border-border rounded text-[11px] text-text-primary focus:outline-none min-w-[100px]"
                  >
                    {FIELDS.map((f) => (
                      <option key={f.key} value={f.key}>
                        {f.label}
                      </option>
                    ))}
                  </select>

                  {/* Operator */}
                  <select
                    value={rule.operator}
                    onChange={(e) => updateRule(i, { operator: e.target.value })}
                    className="px-2 py-1.5 bg-bg-card border border-border rounded text-[11px] text-text-primary focus:outline-none min-w-[120px]"
                  >
                    {operators.map((op) => (
                      <option key={op.key} value={op.key}>
                        {op.label}
                      </option>
                    ))}
                  </select>

                  {/* Value */}
                  {needsValue && (
                    <input
                      type={fieldType === "number" || fieldType === "date" ? "number" : "text"}
                      value={rule.value}
                      onChange={(e) => updateRule(i, { value: e.target.value })}
                      placeholder={fieldType === "date" ? "days" : "value"}
                      className="flex-1 min-w-[60px] px-2 py-1.5 bg-bg-card border border-border rounded text-[11px] text-text-primary placeholder:text-text-tertiary focus:outline-none"
                    />
                  )}

                  {/* Value2 (for between) */}
                  {needsValue2 && (
                    <>
                      <span className="text-[10px] text-text-tertiary">and</span>
                      <input
                        type="number"
                        value={rule.value2 ?? ""}
                        onChange={(e) => updateRule(i, { value2: e.target.value || undefined })}
                        placeholder="max"
                        className="w-[60px] px-2 py-1.5 bg-bg-card border border-border rounded text-[11px] text-text-primary placeholder:text-text-tertiary focus:outline-none"
                      />
                    </>
                  )}

                  {/* Remove */}
                  <button
                    onClick={() => removeRule(i)}
                    disabled={rules.length <= 1}
                    className="p-1 text-text-tertiary hover:text-text-secondary disabled:opacity-20 transition-colors"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-3.5 h-3.5">
                      <path strokeLinecap="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              );
            })}
          </div>

          <button onClick={addRule} className="text-[11px] text-accent hover:text-accent/80 transition-colors">
            + Add Rule
          </button>

          {/* Sort & limit */}
          <div className="pt-2 border-t border-border space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-text-tertiary w-16 shrink-0">Sort by</span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="flex-1 px-2 py-1.5 bg-bg-card border border-border rounded text-[11px] text-text-primary focus:outline-none"
              >
                <option value="">Default</option>
                <option value="title">Title</option>
                <option value="artist">Artist</option>
                <option value="album">Album</option>
                <option value="year">Year</option>
                <option value="rating">Rating</option>
                <option value="play_count">Play Count</option>
                <option value="created_at">Date Added</option>
              </select>
              <select
                value={sortDirection}
                onChange={(e) => setSortDirection(e.target.value)}
                className="px-2 py-1.5 bg-bg-card border border-border rounded text-[11px] text-text-primary focus:outline-none"
              >
                <option value="asc">Ascending</option>
                <option value="desc">Descending</option>
              </select>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-text-tertiary w-16 shrink-0">Limit to</span>
              <input
                type="number"
                value={limit}
                onChange={(e) => setLimit(e.target.value)}
                placeholder="no limit"
                className="w-[80px] px-2 py-1.5 bg-bg-card border border-border rounded text-[11px] text-text-primary placeholder:text-text-tertiary focus:outline-none"
              />
              <span className="text-[11px] text-text-tertiary">tracks</span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-border flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="px-4 py-1.5 bg-bg-card border border-border text-text-secondary rounded-lg text-[11px] font-medium hover:bg-bg-hover transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!name.trim()}
            className="px-4 py-1.5 bg-text-primary text-bg-primary rounded-lg text-[11px] font-medium transition-all hover:not-disabled:opacity-90 disabled:opacity-40"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
};
