import {
  differenceInHours,
  differenceInDays,
  isPast,
  parseISO,
} from "date-fns";

export type DeadlineStatus = "safe" | "warning" | "urgent" | "overdue" | "none";

export interface DeadlineInfo {
  status: DeadlineStatus;
  label: string;
  color: string;
  borderColor: string;
  bgColor: string;
}

export function getDeadlineInfo(deadlineAt: string | null): DeadlineInfo {
  if (!deadlineAt) {
    return {
      status: "none",
      label: "",
      color: "text-gray-400",
      borderColor: "border-transparent",
      bgColor: "",
    };
  }

  const deadline = parseISO(deadlineAt);
  const now = new Date();

  if (isPast(deadline)) {
    const daysOverdue = differenceInDays(now, deadline);
    return {
      status: "overdue",
      label: `${daysOverdue}d overdue`,
      color: "text-red-600",
      borderColor: "border-red-400",
      bgColor: "bg-red-50",
    };
  }

  const hoursLeft = differenceInHours(deadline, now);
  const daysLeft = differenceInDays(deadline, now);

  if (hoursLeft <= 24) {
    return {
      status: "urgent",
      label: `${hoursLeft}h left`,
      color: "text-orange-600",
      borderColor: "border-orange-400",
      bgColor: "bg-orange-50",
    };
  }

  if (daysLeft <= 2) {
    return {
      status: "warning",
      label: `${daysLeft}d left`,
      color: "text-yellow-600",
      borderColor: "border-yellow-400",
      bgColor: "bg-yellow-50",
    };
  }

  return {
    status: "safe",
    label: `${daysLeft}d left`,
    color: "text-gray-500",
    borderColor: "border-transparent",
    bgColor: "",
  };
}

export function formatTimeAgo(dateStr: string): string {
  const date = parseISO(dateStr);
  const now = new Date();
  const hours = differenceInHours(now, date);
  const days = differenceInDays(now, date);

  if (hours < 1) return "Just now";
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
}
