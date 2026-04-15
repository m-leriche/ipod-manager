interface PlaybackButtonProps {
  onClick: () => void;
  variant?: "primary" | "secondary";
  size?: "sm" | "md" | "lg";
  title?: string;
  disabled?: boolean;
  children: React.ReactNode;
}

const sizeClasses = {
  sm: "w-7 h-7",
  md: "w-9 h-9",
  lg: "w-11 h-11",
} as const;

export const PlaybackButton = ({
  onClick,
  variant = "secondary",
  size = "md",
  title,
  disabled,
  children,
}: PlaybackButtonProps) => (
  <button
    onClick={onClick}
    title={title}
    disabled={disabled}
    className={`${sizeClasses[size]} rounded-full flex items-center justify-center transition-all ${
      disabled
        ? "opacity-30 cursor-not-allowed"
        : variant === "primary"
          ? "bg-text-primary text-bg-primary hover:bg-text-primary/90"
          : "text-text-secondary hover:text-text-primary"
    }`}
  >
    {children}
  </button>
);
