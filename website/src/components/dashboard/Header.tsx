"use client";

import React, { useState, useEffect, useCallback } from "react";
import { usePathname } from "next/navigation";
import { useQuery } from "@apollo/client/react";
import { LuMenu, LuSearch, LuMapPin } from "react-icons/lu";

import { useDashboardStore } from "@/src/store/dashboard-store";
import { useAuthStore } from "@/src/store/auth-store";
import { navigation } from "@/src/config/navigation";
import NotificationDropdown from "@/src/components/notifications/NotificationDropdown";
import { GET_MUNICIPALITY } from "@/src/graphql/operations/municipality";
import CommandSearch from "./CommandSearch";
// import MunicipalitySelector from "./MunicipalitySelector";

interface MunicipalityBadgeData {
  municipality: {
    id: string;
    name: string;
    code: string;
  } | null;
}

function isSeedManagedRole(role?: string | null) {
  return role === "ward" || role === "municipality";
}

function getPageTitle(pathname: string): string {
  for (const section of navigation) {
    for (const item of section.items) {
      if (pathname === item.href) return item.label;
    }
  }
  return "Dashboard";
}

function getPageDescription(pathname: string): string {
  const descriptions: Record<string, string> = {
    "/dashboard/kanban": "Drag and drop reports across workflow stages",
    "/dashboard/overview": "Overview of your ward's civic reports and metrics",
    "/dashboard/reports": "View and manage all citizen reports",
    "/dashboard/officers": "Manage field officers and assignments",
    "/dashboard/wards":
      "Compare wards, officers, upvotes, ratings, and report pressure",
    "/dashboard/analytics": "Performance metrics and trend analysis",
    "/dashboard/map": "Review ward and municipality borders with mapped tasks",
    "/dashboard/insights/departments":
      "View fixed department groupings and officer distribution",
    "/dashboard/settings": "Configure board, deadlines, and preferences",
  };
  return descriptions[pathname] || "";
}

export default function Header() {
  const pathname = usePathname();
  const { toggleSidebar } = useDashboardStore();
  const { user } = useAuthStore();
  const hideProfileAvatar = isSeedManagedRole(user?.role);
  const { data: municipalityData } = useQuery<MunicipalityBadgeData>(
    GET_MUNICIPALITY,
    {
      variables: { id: user?.municipality_id ?? null },
      skip: user?.role !== "municipality" || !user?.municipality_id,
      fetchPolicy: "cache-first",
    },
  );

  const title = getPageTitle(pathname);
  const description = getPageDescription(pathname);

  const [searchOpen, setSearchOpen] = useState(false);

  // Ctrl+K / Cmd+K global shortcut
  const handleGlobalKey = useCallback((e: KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "k") {
      e.preventDefault();
      setSearchOpen((prev) => !prev);
    }
  }, []);

  useEffect(() => {
    document.addEventListener("keydown", handleGlobalKey);
    return () => document.removeEventListener("keydown", handleGlobalKey);
  }, [handleGlobalKey]);

  return (
    <header className="sticky top-0 z-30 bg-white border-b border-gray-200">
      <div className="flex items-center justify-between h-16 px-4 lg:px-6">
        {/* Left */}
        <div className="flex items-center gap-4">
          <button
            onClick={toggleSidebar}
            className="lg:hidden p-2 rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors cursor-pointer"
            aria-label="Toggle sidebar"
          >
            <LuMenu className="text-xl" />
          </button>

          <div>
            <h1 className="text-lg font-semibold text-gray-900">{title}</h1>
            {description && (
              <p className="text-sm text-gray-500 hidden sm:block">
                {description}
              </p>
            )}
          </div>
        </div>

        {/* Right */}
        <div className="flex items-center gap-2">
          {/* Ward Badge */}

          <button
            onClick={() => setSearchOpen(true)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors cursor-pointer border border-gray-200"
            title="Search (Ctrl+K)"
          >
            <LuSearch className="text-base" />
            <span className="hidden md:inline text-sm text-gray-400">
              Search...
            </span>
            <kbd className="hidden md:inline-flex items-center px-1.5 py-0.5 text-[10px] font-medium text-gray-400 bg-gray-100 border border-gray-200 rounded">
              Ctrl K
            </kbd>
          </button>

          <NotificationDropdown />

          <div className="hidden sm:block w-px h-8 bg-gray-200 mx-1" />

          {user?.ward && (
            <div className="hidden md:flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 border border-blue-200 rounded-lg">
              <LuMapPin className="text-blue-600 text-sm" />
              <span className="text-sm font-medium text-blue-700">
                {user.ward.name}
              </span>
              <span className="text-xs text-blue-500">
                ({user.ward.ward_code})
              </span>
            </div>
          )}

          {user?.role === "municipality" && municipalityData?.municipality && (
            <div className="hidden md:flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 border border-emerald-200 rounded-lg">
              <LuMapPin className="text-emerald-600 text-sm" />
              <span className="text-sm font-medium text-emerald-700">
                {municipalityData.municipality.name}
              </span>
              <span className="text-xs text-emerald-500">
                ({municipalityData.municipality.code})
              </span>
            </div>
          )}
        </div>
      </div>

      <CommandSearch isOpen={searchOpen} onClose={() => setSearchOpen(false)} />
    </header>
  );
}
