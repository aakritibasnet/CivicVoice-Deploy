"use client";

import { LuPlus, LuSearch } from "react-icons/lu";
import { Button } from "@/src/ui/Button";
import type {
  OfficerFilterAccess,
  OfficerFilterType,
  OfficerViewer,
} from "@/src/types/officers";

interface OfficerFiltersBarProps {
  viewer: OfficerViewer;
  query: string;
  type: OfficerFilterType;
  access: OfficerFilterAccess;
  onQueryChange: (value: string) => void;
  onTypeChange: (value: OfficerFilterType) => void;
  onAccessChange: (value: OfficerFilterAccess) => void;
  onCreate: () => void;
  canCreate: boolean;
}

const selectStyles =
  "h-11 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 shadow-sm outline-none transition focus:border-sky-300 focus:ring-4 focus:ring-sky-100";

export function OfficerFiltersBar({
  viewer,
  query,
  type,
  access,
  onQueryChange,
  onTypeChange,
  onAccessChange,
  onCreate,
  canCreate,
}: OfficerFiltersBarProps) {
  return (
    <div className="rounded-[28px] border border-slate-200 bg-white/90 p-4 shadow-sm backdrop-blur">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="grid gap-3 md:grid-cols-[minmax(0,2fr)_180px_200px] xl:flex-1">
          <label className="relative block">
            <LuSearch className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              placeholder="Search officer, department, ward"
              className="h-11 w-full rounded-2xl border border-slate-200 bg-slate-50 pl-11 pr-4 text-sm text-slate-900 outline-none transition focus:border-sky-300 focus:bg-white focus:ring-4 focus:ring-sky-100"
            />
          </label>

          <select
            value={type}
            onChange={(event) =>
              onTypeChange(event.target.value as OfficerFilterType)
            }
            className={selectStyles}
          >
            <option value="all">All types</option>
            {viewer.role !== "municipality" && (
              <option value="ward_officer">Ward officers</option>
            )}
            <option value="municipality_officer">Municipality officers</option>
          </select>

          <select
            value={access}
            onChange={(event) =>
              onAccessChange(event.target.value as OfficerFilterAccess)
            }
            className={selectStyles}
          >
            <option value="all">All visibility</option>
            <option value="manageable">Editable by me</option>
            {viewer.role !== "ward" ? (
              <option value="read_only">Read only</option>
            ) : null}
          </select>
        </div>

        <Button
          onClick={onCreate}
          leftIcon={<LuPlus />}
          disabled={!canCreate}
          className="rounded-2xl shadow-sm"
        >
          Add officer
        </Button>
      </div>
    </div>
  );
}
