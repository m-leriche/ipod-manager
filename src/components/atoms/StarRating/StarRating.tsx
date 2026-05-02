import { useState, useCallback } from "react";

interface StarRatingProps {
  rating: number;
  onChange?: (rating: number) => void;
  size?: "sm" | "md";
}

const STAR_SIZES = { sm: "w-3 h-3", md: "w-4 h-4" };

export const StarRating = ({ rating, onChange, size = "md" }: StarRatingProps) => {
  const [hoverRating, setHoverRating] = useState(0);
  const interactive = !!onChange;
  const displayRating = hoverRating || rating;
  const sizeClass = STAR_SIZES[size];

  const handleClick = useCallback(
    (star: number) => {
      if (!onChange) return;
      // Clicking the same rating clears it
      onChange(star === rating ? 0 : star);
    },
    [onChange, rating],
  );

  if (!interactive && rating === 0) {
    return <span className="text-text-tertiary/30 text-[10px]">-</span>;
  }

  return (
    <div
      className={`flex items-center gap-px ${interactive ? "cursor-pointer" : ""}`}
      onMouseLeave={() => interactive && setHoverRating(0)}
    >
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          disabled={!interactive}
          onClick={(e) => {
            e.stopPropagation();
            handleClick(star);
          }}
          onMouseEnter={() => interactive && setHoverRating(star)}
          className={`${interactive ? "hover:scale-110" : ""} transition-transform disabled:cursor-default p-0 border-0 bg-transparent`}
        >
          <svg viewBox="0 0 24 24" className={sizeClass}>
            <path
              d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
              fill={star <= displayRating ? "currentColor" : "none"}
              stroke="currentColor"
              strokeWidth={1.5}
              strokeLinejoin="round"
              className={
                star <= displayRating ? "text-accent" : interactive ? "text-text-tertiary/40" : "text-text-tertiary/20"
              }
            />
          </svg>
        </button>
      ))}
    </div>
  );
};
