interface SortableHeaderProps {
  label: string;
  sortKey: string;
  activeSortKey: string;
  sortDirection: "asc" | "desc";
  onSort: (key: string) => void;
  align?: "left" | "right";
  className?: string;
}

export const SortableHeader = ({
  label,
  sortKey,
  activeSortKey,
  sortDirection,
  onSort,
  align = "left",
  className = "",
}: SortableHeaderProps) => {
  const isActive = sortKey === activeSortKey;

  return (
    <th
      onClick={() => onSort(sortKey)}
      className={`px-3 py-2 text-[10px] font-medium uppercase tracking-wider cursor-pointer select-none transition-colors hover:text-text-primary ${
        isActive ? "text-text-primary" : "text-text-tertiary"
      } ${align === "right" ? "text-right" : "text-left"} ${className}`}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {isActive && <span className="text-[8px]">{sortDirection === "asc" ? "▲" : "▼"}</span>}
      </span>
    </th>
  );
};
