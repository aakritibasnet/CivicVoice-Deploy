"use client";

import { LuStar } from "react-icons/lu";

interface StarRatingInputProps {
  value: number | null;
  average: number;
  count: number;
  disabled?: boolean;
  onRate: (rating: number) => void;
}

export default function StarRatingInput({
  value,
  average,
  count,
  disabled = false,
  onRate,
}: StarRatingInputProps) {
  const activeRating = value ?? Math.round(average);

  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-1">
        {[1, 2, 3, 4, 5].map((star) => {
          const isActive = star <= activeRating;

          return (
            <button
              key={star}
              type="button"
              disabled={disabled}
              onClick={() => onRate(star)}
              className={`rounded-full p-1 transition-colors ${
                disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:bg-amber-50"
              }`}
              aria-label={`Rate ${star} star${star === 1 ? "" : "s"}`}
            >
              <LuStar
                className={`text-lg ${
                  isActive ? "fill-amber-400 text-amber-500" : "text-gray-300"
                }`}
              />
            </button>
          );
        })}
      </div>

      <div className="text-sm text-gray-500">
        <span className="font-semibold text-gray-900">{average.toFixed(1)}</span>{" "}
        <span>({count})</span>
      </div>
    </div>
  );
}
