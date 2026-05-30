import React from "react";

interface StatCardProps {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  change?: {
    value: string;
    positive: boolean;
  };
  color: "blue" | "green" | "yellow" | "red" | "purple" | "gray";
}

const colorMap = {
  blue: {
    bg: "bg-blue-50",
    icon: "text-blue-600",
    badge: "bg-blue-100 text-blue-700",
  },
  green: {
    bg: "bg-green-50",
    icon: "text-green-600",
    badge: "bg-green-100 text-green-700",
  },
  yellow: {
    bg: "bg-yellow-50",
    icon: "text-yellow-600",
    badge: "bg-yellow-100 text-yellow-700",
  },
  red: {
    bg: "bg-red-50",
    icon: "text-red-600",
    badge: "bg-red-100 text-red-700",
  },
  purple: {
    bg: "bg-purple-50",
    icon: "text-purple-600",
    badge: "bg-purple-100 text-purple-700",
  },
  gray: {
    bg: "bg-gray-50",
    icon: "text-gray-600",
    badge: "bg-gray-100 text-gray-700",
  },
};

export default function StatCard({
  label,
  value,
  icon,
  change,
  color,
}: StatCardProps) {
  const colors = colorMap[color];

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-sm transition-shadow">
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <p className="text-sm font-medium text-gray-500">{label}</p>
          <p className="text-2xl font-bold text-gray-900">{value}</p>

          {change && (
            <p
              className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${
                change.positive
                  ? "bg-green-100 text-green-700"
                  : "bg-red-100 text-red-700"
              }`}
            >
              {change.positive ? "↑" : "↓"} {change.value}
            </p>
          )}
        </div>

        <div
          className={`h-10 w-10 rounded-lg ${colors.bg} ${colors.icon} flex items-center justify-center text-xl`}
        >
          {icon}
        </div>
      </div>
    </div>
  );
}
