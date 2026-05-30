"use client";

import React from "react";

interface ColorPickerProps {
  value: string;
  onChange: (color: string) => void;
  colors?: string[];
}

const DEFAULT_COLORS = [
  "#3b82f6", // blue
  "#8b5cf6", // purple
  "#06b6d4", // cyan
  "#10b981", // green
  "#f59e0b", // amber
  "#f97316", // orange
  "#ef4444", // red
  "#ec4899", // pink
  "#6b7280", // gray
  "#14b8a6", // teal
  "#a855f7", // violet
  "#eab308", // yellow
];

export default function ColorPicker({
  value,
  onChange,
  colors = DEFAULT_COLORS,
}: ColorPickerProps) {
  return (
    <div className="grid grid-cols-6 gap-2 p-2">
      {colors.map((color) => (
        <button
          key={color}
          type="button"
          onClick={() => onChange(color)}
          className={`
            w-8 h-8 rounded-md transition-all duration-200
            hover:scale-110 hover:shadow-md
            ${value === color ? "ring-2 ring-offset-2 ring-gray-900 scale-110" : ""}
          `}
          style={{ backgroundColor: color }}
          title={color}
        />
      ))}
    </div>
  );
}
