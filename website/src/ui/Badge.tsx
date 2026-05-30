import React from "react";

type BadgeVariant =
  | "default"
  | "primary"
  | "success"
  | "warning"
  | "danger"
  | "purple"
  | "outline";

type BadgeSize = "sm" | "md";

interface BadgeProps {
  children: React.ReactNode;
  variant?: BadgeVariant;
  size?: BadgeSize;
  dot?: boolean;
  className?: string;
}

const variantStyles: Record<BadgeVariant, string> = {
  default: "bg-gray-100 text-gray-700",
  primary: "bg-blue-100 text-blue-700",
  success: "bg-green-100 text-green-700",
  warning: "bg-yellow-100 text-yellow-800",
  danger: "bg-red-100 text-red-700",
  purple: "bg-purple-100 text-purple-700",
  outline: "bg-white text-gray-600 border border-gray-300",
};

const sizeStyles: Record<BadgeSize, string> = {
  sm: "px-1.5 py-0.5 text-[10px]",
  md: "px-2 py-0.5 text-xs",
};

const dotSizeStyles: Record<BadgeSize, string> = {
  sm: "h-1 w-1",
  md: "h-1.5 w-1.5",
};

export function Badge({
  children,
  variant = "default",
  size = "md",
  dot = false,
  className = "",
}: BadgeProps) {
  return (
    <span
      className={`
        inline-flex items-center gap-1 font-medium rounded-full whitespace-nowrap
        ${variantStyles[variant]}
        ${sizeStyles[size]}
        ${className}
      `}
    >
      {dot && (
        <span
          className={`rounded-full ${dotSizeStyles[size]} bg-current opacity-60`}
        />
      )}
      {children}
    </span>
  );
}

// ─── Preset Helpers ──────────────────────────────────
const priorityMap: Record<string, BadgeVariant> = {
  low: "default",
  medium: "primary",
  high: "warning",
  critical: "danger",
};

const statusMap: Record<string, BadgeVariant> = {
  incoming: "default",
  escalated: "primary",
  in_progress: "primary",
  completed: "success",
  returned: "warning",
  invalid: "danger",
};

const categoryColors: Record<string, BadgeVariant> = {
  "Roads and Infrastructure": "warning",
  "Sanitation and Waste Management": "success",
  "Public Utilities Water and Power": "primary",
  "Environment and Parks": "success",
  "Traffic and Transport": "purple",
  "Road Damage": "warning",
  Drainage: "primary",
  "Waste Management": "success",
  "Street Lights": "purple",
  "Water Supply": "primary",
  Safety: "danger",
};

export function PriorityBadge({ priority }: { priority: string }) {
  return (
    <Badge variant={priorityMap[priority] || "default"} size="sm" dot>
      {priority}
    </Badge>
  );
}

export function StatusBadge({
  status,
  label,
  variantStatus,
}: {
  status: string;
  label?: string;
  variantStatus?: string;
}) {
  const displayLabel = label ?? status.replace(/_/g, " ");
  const badgeStatus = variantStatus ?? status;
  return (
    <Badge variant={statusMap[badgeStatus] || "default"} size="sm">
      {displayLabel}
    </Badge>
  );
}

export function CategoryBadge({ category }: { category: string }) {
  return (
    <Badge variant={categoryColors[category] || "default"} size="sm">
      {category}
    </Badge>
  );
}

export type { BadgeProps, BadgeVariant, BadgeSize };
