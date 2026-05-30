"use client";

import { LuBookmark } from "react-icons/lu";

interface BookmarkButtonProps {
  active: boolean;
  count: number;
  disabled?: boolean;
  onToggle: () => void;
}

export default function BookmarkButton({
  active,
  count,
  disabled = false,
  onToggle,
}: BookmarkButtonProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onToggle}
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors ${
        active
          ? "border-sky-200 bg-sky-50 text-sky-700"
          : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
      } ${disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}
    >
      <LuBookmark className={active ? "fill-sky-500 text-sky-500" : ""} />
      <span>{count}</span>
    </button>
  );
}
