import {
  LuKanban,
  LuFileText,
  LuUsers,
  LuBuilding2,
  LuBell,
  LuMap,
  LuMessageSquare,
} from "react-icons/lu";
import { IoBarChart } from "react-icons/io5";

export type UserRole = "admin" | "ward" | "municipality";

export interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  roles: UserRole[];
  badge?: string;
}

export interface NavSection {
  title: string;
  items: NavItem[];
}

export const navigation: NavSection[] = [
  {
    title: "Overview",
    items: [
      {
        label: "Kanban Board",
        href: "/dashboard/kanban",
        icon: LuKanban,
        roles: ["admin", "ward", "municipality"],
      },
    ],
  },
  {
    title: "Management",
    items: [
      {
        label: "Reports",
        href: "/dashboard/reports",
        icon: LuFileText,
        roles: ["admin", "ward", "municipality"],
      },
      {
        label: "Officers",
        href: "/dashboard/officers",
        icon: LuUsers,
        roles: ["admin", "municipality", "ward"],
      },
      {
        label: "Wards",
        href: "/dashboard/wards",
        icon: LuBuilding2,
        roles: ["admin", "municipality"],
      },
    ],
  },
  {
    title: "Insights",
    items: [
      {
        label: "Analytics",
        href: "/dashboard/analytics",
        icon: IoBarChart,
        roles: ["admin", "ward", "municipality"],
      },
      {
        label: "Departments",
        href: "/dashboard/insights/departments",
        icon: LuBuilding2,
        roles: ["admin", "ward", "municipality"],
      },
      {
        label: "Map",
        href: "/dashboard/map",
        icon: LuMap,
        roles: ["admin", "municipality"],
      },
    ],
  },
  {
    title: "Communication",
    items: [
      {
        label: "Messages",
        href: "/dashboard/chat",
        icon: LuMessageSquare,
        roles: ["ward", "municipality"],
      },
    ],
  },
  {
    title: "System",
    items: [
      {
        label: "Notifications",
        href: "/dashboard/notifications",
        icon: LuBell,
        roles: ["admin", "ward", "municipality"],
      },
    ],
  },
];

export function getFilteredNavigation(role: UserRole): NavSection[] {
  return navigation
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => item.roles.includes(role)),
    }))
    .filter((section) => section.items.length > 0);
}
