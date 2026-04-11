export function Pill({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="px-2.5 py-1 rounded-lg text-[10px] font-medium text-text-tertiary hover:text-text-secondary transition-all"
    >
      {children}
    </button>
  );
}
