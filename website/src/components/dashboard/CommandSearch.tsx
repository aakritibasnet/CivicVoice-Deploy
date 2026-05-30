"use client";

import React, {
  useState,
  useEffect,
  useRef,
  useDeferredValue,
  useMemo,
  useCallback,
} from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@apollo/client/react";
import {
  LuSearch,
  LuUser,
  LuBuilding2,
  LuFileText,
  LuLogOut,
  LuCommand,
  LuCornerDownLeft,
} from "react-icons/lu";

import { GET_KANBAN_BOARD } from "@/src/graphql/operations/kanban";
import { GET_OFFICER_DIRECTORY } from "@/src/graphql/operations/officers";
import { getFilteredNavigation, type UserRole } from "@/src/config/navigation";
import { useAuthStore } from "@/src/store/auth-store";

// ─── Query types ─────────────────────────────────────

interface OfficerNode {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone_number: string | null;
  department: { id: string; slug: string; name: string; description: string | null } | null;
  ward: { id: string; name: string; ward_code: string } | null;
}

interface DepartmentNode {
  id: string;
  slug: string;
  name: string;
  description: string | null;
}

interface OfficerDirectoryQueryData {
  officers: OfficerNode[];
  officerDepartments: DepartmentNode[];
}

interface KanbanReportNode {
  id: string;
  title: string;
  description: string | null;
  category: string;
  subcategory: string | null;
  priority: string;
  address_text: string | null;
  assigned_officer: { name: string } | null;
  assigned_department: { name: string } | null;
  ward: { name: string } | null;
}

interface KanbanColumnNode {
  id: string;
  name: string;
  reports: KanbanReportNode[];
}

interface KanbanBoardQueryData {
  kanbanBoard: KanbanColumnNode[];
}

// ─── Types ───────────────────────────────────────────

interface SearchResult {
  id: string;
  label: string;
  sublabel?: string;
  icon: React.ComponentType<{ className?: string }>;
  type: "officer" | "department" | "feature" | "task";
  action: () => void;
}

type SearchMode = "default" | "officers" | "features";

// ─── Helpers ─────────────────────────────────────────

function getSearchMode(query: string): { mode: SearchMode; cleanQuery: string } {
  if (query.startsWith("@")) {
    return { mode: "officers", cleanQuery: query.slice(1).trim() };
  }
  if (query.startsWith("/")) {
    return { mode: "features", cleanQuery: query.slice(1).trim() };
  }
  return { mode: "default", cleanQuery: query.trim() };
}

function matchesQuery(text: string, query: string): boolean {
  return text.toLowerCase().includes(query.toLowerCase());
}

const priorityColors: Record<string, string> = {
  critical: "bg-red-100 text-red-700",
  high: "bg-orange-100 text-orange-700",
  medium: "bg-yellow-100 text-yellow-700",
  low: "bg-green-100 text-green-700",
};

// ─── Component ───────────────────────────────────────

export default function CommandSearch({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const { user, clearAuth } = useAuthStore();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [activeIndex, setActiveIndex] = useState(0);

  const role = (user?.role || "ward") as UserRole;

  // ─── Data fetching ──────────────────────────────────
  const { data: kanbanData } = useQuery<KanbanBoardQueryData>(GET_KANBAN_BOARD, {
    skip: !isOpen,
    fetchPolicy: "cache-first",
  });

  const { data: officerData } = useQuery<OfficerDirectoryQueryData>(GET_OFFICER_DIRECTORY, {
    skip: !isOpen,
    fetchPolicy: "cache-first",
  });

  // ─── Build results ──────────────────────────────────
  const results = useMemo<SearchResult[]>(() => {
    const { mode, cleanQuery } = getSearchMode(deferredQuery);

    // ── @ mode: Officers & Departments ──
    if (mode === "officers") {
      const items: SearchResult[] = [];

      // Officers
      if (officerData?.officers) {
        for (const officer of officerData.officers) {
          const fullName = `${officer.first_name} ${officer.last_name}`;
          const deptName = officer.department?.name || "";
          const wardName = officer.ward?.name || "";
          const searchStr = `${fullName} ${deptName} ${wardName} ${officer.phone_number || ""} ${officer.email || ""}`;

          if (!cleanQuery || matchesQuery(searchStr, cleanQuery)) {
            items.push({
              id: `officer-${officer.id}`,
              label: fullName,
              sublabel: [deptName, wardName].filter(Boolean).join(" · "),
              icon: LuUser,
              type: "officer",
              action: () => {
                router.push("/dashboard/officers");
                onClose();
              },
            });
          }
        }
      }

      // Departments
      if (officerData?.officerDepartments) {
        for (const dept of officerData.officerDepartments) {
          const searchStr = `${dept.name} ${dept.description || ""}`;
          if (!cleanQuery || matchesQuery(searchStr, cleanQuery)) {
            items.push({
              id: `dept-${dept.id}`,
              label: dept.name,
              sublabel: "Department",
              icon: LuBuilding2,
              type: "department",
              action: () => {
                router.push("/dashboard/insights/departments");
                onClose();
              },
            });
          }
        }
      }

      return items.slice(0, 20);
    }

    // ── / mode: Features & Actions ──
    if (mode === "features") {
      const items: SearchResult[] = [];
      const sections = getFilteredNavigation(role);

      for (const section of sections) {
        for (const item of section.items) {
          if (!cleanQuery || matchesQuery(item.label, cleanQuery)) {
            items.push({
              id: `nav-${item.href}`,
              label: item.label,
              sublabel: section.title,
              icon: item.icon,
              type: "feature",
              action: () => {
                router.push(item.href);
                onClose();
              },
            });
          }
        }
      }

      // Settings
      if (!cleanQuery || matchesQuery("settings", cleanQuery)) {
        items.push({
          id: "nav-settings",
          label: "Settings",
          sublabel: "System",
          icon: LuCommand,
          type: "feature",
          action: () => {
            router.push("/dashboard/settings");
            onClose();
          },
        });
      }

      // Logout
      if (!cleanQuery || matchesQuery("logout sign out", cleanQuery)) {
        items.push({
          id: "action-logout",
          label: "Logout",
          sublabel: "Sign out of your account",
          icon: LuLogOut,
          type: "feature",
          action: () => {
            clearAuth();
            router.push("/auth/login");
            onClose();
          },
        });
      }

      return items;
    }

    // ── Default: Search tasks from kanban ──
    if (!cleanQuery) return [];

    const tasks: SearchResult[] = [];
    if (kanbanData?.kanbanBoard) {
      for (const column of kanbanData.kanbanBoard) {
        for (const report of column.reports || []) {
          const searchStr = [
            report.title,
            report.description,
            report.category,
            report.subcategory,
            report.assigned_officer?.name,
            report.assigned_department?.name,
            report.ward?.name,
            report.address_text,
            report.id,
          ]
            .filter(Boolean)
            .join(" ");

          if (matchesQuery(searchStr, cleanQuery)) {
            tasks.push({
              id: `task-${report.id}`,
              label: report.title,
              sublabel: [
                column.name,
                report.category,
                report.priority ? report.priority : null,
              ]
                .filter(Boolean)
                .join(" · "),
              icon: LuFileText,
              type: "task",
              action: () => {
                router.push("/dashboard/kanban");
                onClose();
              },
            });
          }
        }
      }
    }

    return tasks.slice(0, 25);
  }, [deferredQuery, officerData, kanbanData, role, router, onClose, clearAuth]);

  // ─── Keyboard navigation ───────────────────────────
  const handleSelect = useCallback(
    (index: number) => {
      if (results[index]) results[index].action();
    },
    [results],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((i) => Math.min(i + 1, results.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        handleSelect(activeIndex);
      } else if (e.key === "Escape") {
        onClose();
      }
    },
    [results.length, activeIndex, handleSelect, onClose],
  );

  // Reset active index on query change
  useEffect(() => {
    setActiveIndex(0);
  }, [deferredQuery]);

  // Scroll active item into view
  useEffect(() => {
    const container = listRef.current;
    if (!container) return;
    const activeEl = container.querySelector(`[data-index="${activeIndex}"]`);
    if (activeEl) {
      activeEl.scrollIntoView({ block: "nearest" });
    }
  }, [activeIndex]);

  // Focus input on open, reset state
  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setActiveIndex(0);
      // Small delay so the DOM is rendered
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [isOpen]);

  // Global Ctrl+K shortcut
  useEffect(() => {
    function handleGlobal(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        if (isOpen) onClose();
        // Parent handles opening via the same shortcut
      }
    }
    document.addEventListener("keydown", handleGlobal);
    return () => document.removeEventListener("keydown", handleGlobal);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const { mode } = getSearchMode(query);

  const modeHint =
    mode === "officers"
      ? "Searching officers & departments"
      : mode === "features"
        ? "Searching features & actions"
        : "Search tasks by title, category, or description";

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh] sm:pt-[15vh]">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-gray-900/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Search panel */}
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-xl mx-4 overflow-hidden border border-gray-200">
        {/* Input */}
        <div className="flex items-center gap-3 px-4 border-b border-gray-200">
          <LuSearch className="text-gray-400 text-lg shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search tasks...  @ officers  / features"
            className="flex-1 py-3.5 text-sm text-gray-900 placeholder-gray-400 outline-none bg-transparent"
          />
          <kbd className="hidden sm:inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-medium text-gray-400 bg-gray-100 border border-gray-200 rounded">
            ESC
          </kbd>
        </div>

        {/* Mode indicator */}
        {query.length > 0 && (
          <div className="px-4 py-2 bg-gray-50 border-b border-gray-100">
            <p className="text-xs text-gray-500">{modeHint}</p>
          </div>
        )}

        {/* Results */}
        <div ref={listRef} className="max-h-[50vh] overflow-y-auto">
          {results.length > 0 ? (
            <div className="py-2">
              {results.map((result, index) => {
                const Icon = result.icon;
                return (
                  <button
                    key={result.id}
                    data-index={index}
                    onClick={() => handleSelect(index)}
                    onMouseEnter={() => setActiveIndex(index)}
                    className={`
                      w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors cursor-pointer
                      ${index === activeIndex ? "bg-blue-50" : "hover:bg-gray-50"}
                    `}
                  >
                    <div
                      className={`
                        shrink-0 h-8 w-8 rounded-lg flex items-center justify-center
                        ${
                          result.type === "officer"
                            ? "bg-purple-100 text-purple-600"
                            : result.type === "department"
                              ? "bg-teal-100 text-teal-600"
                              : result.type === "feature"
                                ? "bg-blue-100 text-blue-600"
                                : "bg-gray-100 text-gray-600"
                        }
                      `}
                    >
                      <Icon className="text-sm" />
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {result.label}
                      </p>
                      {result.sublabel && (
                        <p className="text-xs text-gray-500 truncate">
                          {result.sublabel}
                        </p>
                      )}
                    </div>

                    {index === activeIndex && (
                      <LuCornerDownLeft className="text-gray-400 text-sm shrink-0" />
                    )}
                  </button>
                );
              })}
            </div>
          ) : query.length > 0 ? (
            <div className="py-10 text-center">
              <LuSearch className="text-gray-300 text-2xl mx-auto mb-2" />
              <p className="text-sm text-gray-500">No results found</p>
              <p className="text-xs text-gray-400 mt-1">
                Try a different search term
              </p>
            </div>
          ) : (
            /* Empty state with hints */
            <div className="py-6 px-4">
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-3">
                Quick tips
              </p>
              <div className="space-y-2.5">
                <div className="flex items-center gap-3 text-sm text-gray-600">
                  <div className="h-7 w-7 rounded-md bg-gray-100 flex items-center justify-center shrink-0">
                    <LuSearch className="text-xs text-gray-400" />
                  </div>
                  <span>Type to search kanban tasks</span>
                </div>
                <div className="flex items-center gap-3 text-sm text-gray-600">
                  <div className="h-7 w-7 rounded-md bg-purple-100 flex items-center justify-center shrink-0">
                    <span className="text-xs font-bold text-purple-500">@</span>
                  </div>
                  <span>
                    <kbd className="px-1 py-0.5 bg-gray-100 rounded text-xs font-mono">@</kbd>{" "}
                    to search officers &amp; departments
                  </span>
                </div>
                <div className="flex items-center gap-3 text-sm text-gray-600">
                  <div className="h-7 w-7 rounded-md bg-blue-100 flex items-center justify-center shrink-0">
                    <span className="text-xs font-bold text-blue-500">/</span>
                  </div>
                  <span>
                    <kbd className="px-1 py-0.5 bg-gray-100 rounded text-xs font-mono">/</kbd>{" "}
                    to search features &amp; actions
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-2 border-t border-gray-100 bg-gray-50">
          <div className="flex items-center gap-3 text-[10px] text-gray-400">
            <span className="flex items-center gap-1">
              <kbd className="px-1 py-0.5 bg-white border border-gray-200 rounded text-[10px]">↑↓</kbd>
              navigate
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1 py-0.5 bg-white border border-gray-200 rounded text-[10px]">↵</kbd>
              select
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1 py-0.5 bg-white border border-gray-200 rounded text-[10px]">esc</kbd>
              close
            </span>
          </div>

          <span className="text-[10px] text-gray-400">
            {results.length} result{results.length !== 1 ? "s" : ""}
          </span>
        </div>
      </div>
    </div>
  );
}
