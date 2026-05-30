"use client";

import React, { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LuShield,
  LuChevronsLeft,
  LuChevronsRight,
  LuLogOut,
  LuX,
} from "react-icons/lu";

import { useDashboardStore } from "@/src/store/dashboard-store";
import { useAuthStore } from "@/src/store/auth-store";
import { getFilteredNavigation } from "@/src/config/navigation";
import { DEFAULT_DASHBOARD_PATH } from "@/src/lib/dashboard-routes";

function isSeedManagedRole(role?: string | null) {
  return role === "ward" || role === "municipality";
}

// ─── User Avatar ─────────────────────────────────────
function UserAvatar({ name, collapsed }: { name: string; collapsed: boolean }) {
  const initials = name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div
      className={`
        shrink-0 rounded-full bg-blue-600 text-white font-semibold flex items-center justify-center
        ${collapsed ? "h-8 w-8 text-xs" : "h-9 w-9 text-sm"}
      `}
    >
      {initials}
    </div>
  );
}

// ─── Nav Item ────────────────────────────────────────
function NavItemLink({
  item,
  isActive,
  collapsed,
  onClick,
}: {
  item: {
    label: string;
    href: string;
    icon: React.ComponentType<{ className?: string }>;
  };
  isActive: boolean;
  collapsed: boolean;
  onClick?: () => void;
}) {
  const Icon = item.icon;

  return (
    <Link
      href={item.href}
      onClick={onClick}
      title={collapsed ? item.label : undefined}
      className={`
        group flex items-center rounded-lg transition-all duration-200
        ${collapsed ? "justify-center px-2 py-2.5" : "gap-3 px-3 py-2.5"}
        ${
          isActive
            ? "bg-blue-50 text-blue-700 font-medium"
            : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
        }
      `}
    >
      <Icon
        className={`shrink-0 ${collapsed ? "text-xl" : "text-lg"} ${
          isActive ? "text-blue-600" : "text-gray-400 group-hover:text-gray-600"
        }`}
      />

      {!collapsed && <span className="text-sm truncate">{item.label}</span>}
    </Link>
  );
}

// ─── Desktop Sidebar ─────────────────────────────────
function DesktopSidebar() {
  const pathname = usePathname();
  const { sidebarCollapsed, toggleCollapse } = useDashboardStore();
  const { user, clearAuth } = useAuthStore();

  const role = user?.role || "ward";
  const hideProfileAvatar = isSeedManagedRole(user?.role);
  const sections = getFilteredNavigation(role);

  return (
    <aside
      className={`
        hidden lg:flex flex-col bg-white border-r border-gray-200 transition-all duration-300 h-screen sticky top-0
        ${sidebarCollapsed ? "w-[72px]" : "w-64"}
      `}
    >
      {/* Header */}
      <div
        className={`
          flex items-center border-b border-gray-200 h-16 shrink-0
          ${sidebarCollapsed ? "justify-center px-2" : "justify-between px-4"}
        `}
      >
        <Link
          href={DEFAULT_DASHBOARD_PATH}
          className="flex items-center gap-2.5 min-w-0"
        >
          <div className="h-8 w-8 rounded-lg bg-blue-600 flex items-center justify-center flex-shrink-0">
            <LuShield className="text-white text-sm" />
          </div>
          {!sidebarCollapsed && (
            <span className="text-sm font-bold text-gray-900 truncate">
              {user?.name}
            </span>
          )}
        </Link>

        {!sidebarCollapsed && (
          <button
            onClick={toggleCollapse}
            className="p-1.5 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors cursor-pointer"
            title="Collapse sidebar"
          >
            <LuChevronsLeft className="text-lg" />
          </button>
        )}
      </div>

      {/* Expand button when collapsed */}
      {sidebarCollapsed && (
        <div className="flex justify-center py-3 border-b border-gray-100">
          <button
            onClick={toggleCollapse}
            className="p-1.5 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors cursor-pointer"
            title="Expand sidebar"
          >
            <LuChevronsRight className="text-lg" />
          </button>
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
        {sections.map((section) => (
          <div key={section.title}>
            {!sidebarCollapsed && (
              <p className="px-3 mb-2 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                {section.title}
              </p>
            )}

            {sidebarCollapsed && (
              <div className="mb-2 mx-auto w-6 border-t border-gray-200" />
            )}

            <div className="space-y-1">
              {section.items.map((item) => (
                <NavItemLink
                  key={item.href}
                  item={item}
                  isActive={pathname === item.href}
                  collapsed={sidebarCollapsed}
                />
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* User section */}
      <div className="border-t border-gray-200 p-3 flex-shrink-0">
        <div
          className={`
            flex items-center rounded-lg
            ${sidebarCollapsed ? "justify-center" : "gap-3 px-2 py-2"}
          `}
        >
          {!hideProfileAvatar && (
            <UserAvatar
              name={user?.name || "User"}
              collapsed={sidebarCollapsed}
            />
          )}

          {!sidebarCollapsed && (
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate text-red-600">
                Log out
              </p>
            </div>
          )}

          {!sidebarCollapsed && (
            <button
              onClick={clearAuth}
              className="p-1.5 rounded-md text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
              title="Sign out"
            >
              <LuLogOut className="text-base" />
            </button>
          )}
        </div>

        {/* Collapsed: show logout below avatar */}
        {sidebarCollapsed && (
          <button
            onClick={clearAuth}
            className="mt-2 w-full p-1.5 rounded-md text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors flex justify-center cursor-pointer"
            title="Sign out"
          >
            <LuLogOut className="text-base" />
          </button>
        )}
      </div>
    </aside>
  );
}

// ─── Mobile Sidebar Drawer ────────────────────────────
function MobileSidebar() {
  const pathname = usePathname();
  const { sidebarOpen, setSidebarOpen } = useDashboardStore();
  const { user, clearAuth } = useAuthStore();

  const role = user?.role || "ward";
  const hideProfileAvatar = isSeedManagedRole(user?.role);
  const sections = getFilteredNavigation(role);

  const close = () => setSidebarOpen(false);

  // Close drawer on route change
  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname, setSidebarOpen]);

  if (!sidebarOpen) return null;

  return (
    <div className="lg:hidden fixed inset-0 z-40 flex">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-gray-900/60 backdrop-blur-sm"
        onClick={close}
      />

      {/* Drawer */}
      <aside className="relative w-72 h-full bg-white flex flex-col shadow-xl animate-in slide-in-from-left duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-4 h-16 border-b border-gray-200 shrink-0">
          <Link
            href={DEFAULT_DASHBOARD_PATH}
            onClick={close}
            className="flex items-center gap-2.5 min-w-0"
          >
            <div className="h-8 w-8 rounded-lg bg-blue-600 flex items-center justify-center shrink-0">
              <LuShield className="text-white text-sm" />
            </div>
            <span className="text-sm font-bold text-gray-900 truncate">
              {user?.name}
            </span>
          </Link>

          <button
            onClick={close}
            className="p-1.5 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors cursor-pointer"
            aria-label="Close menu"
          >
            <LuX className="text-lg" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
          {sections.map((section) => (
            <div key={section.title}>
              <p className="px-3 mb-2 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                {section.title}
              </p>
              <div className="space-y-1">
                {section.items.map((item) => (
                  <NavItemLink
                    key={item.href}
                    item={item}
                    isActive={pathname === item.href}
                    collapsed={false}
                    onClick={close}
                  />
                ))}
              </div>
            </div>
          ))}
        </nav>

        {/* User section */}
        <div className="border-t border-gray-200 p-3 shrink-0">
          <div className="flex items-center gap-3 px-2 py-2 rounded-lg">
            {!hideProfileAvatar && (
              <UserAvatar name={user?.name || "User"} collapsed={false} />
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">
                {user?.name}
              </p>
              <p className="text-xs text-gray-500 truncate capitalize">
                {user?.role}
              </p>
            </div>
            <button
              onClick={() => {
                close();
                clearAuth();
              }}
              className="p-1.5 rounded-md text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
              title="Sign out"
            >
              <LuLogOut className="text-base" />
            </button>
          </div>
        </div>
      </aside>
    </div>
  );
}

// ─── Combined Export ──────────────────────────────────
export default function Sidebar() {
  return (
    <>
      <DesktopSidebar />
      <MobileSidebar />
    </>
  );
}
