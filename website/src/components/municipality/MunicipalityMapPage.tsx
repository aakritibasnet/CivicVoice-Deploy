"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@apollo/client/react";
import {
  LuLoaderCircle,
  LuMapPinned,
  LuRefreshCw,
  LuTriangleAlert,
} from "react-icons/lu";
import { GET_MUNICIPALITY_TRANSPARENCY } from "@/src/graphql/operations/municipality";
import type {
  MunicipalityMapReport,
  MunicipalityTransparencyData,
} from "@/src/types/municipality";
import { MunicipalityScopeMap } from "@/src/components/municipality/MunicipalityScopeMap";
import { Button } from "@/src/ui/Button";
import { useMunicipalityStore } from "@/src/store/municipality-store";

type MapFilter = "all" | "active" | "completed" | "escalated";

const FILTER_OPTIONS: Array<{ value: MapFilter; label: string }> = [
  { value: "all", label: "All tasks" },
  { value: "active", label: "Active only" },
  { value: "completed", label: "Completed" },
  { value: "escalated", label: "Escalated" },
];

const STATUS_COLORS: Record<MunicipalityMapReport["status"], string> = {
  incoming: "#2563eb",
  in_progress: "#d97706",
  completed: "#059669",
  invalid: "#dc2626",
  returned: "#7c3aed",
};

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function filterReports(
  reports: MunicipalityMapReport[],
  reportFilter: MapFilter,
  selectedWardId: string | null,
) {
  return reports.filter((report) => {
    if (selectedWardId && report.ward_id !== selectedWardId) {
      return false;
    }

    if (reportFilter === "active") {
      return report.status === "incoming" || report.status === "in_progress";
    }

    if (reportFilter === "completed") {
      return report.status === "completed";
    }

    if (reportFilter === "escalated") {
      return report.escalated_to_municipality || report.assigned_level === "municipality";
    }

    return true;
  });
}

export default function MunicipalityMapPage() {
  const [selectedWardId, setSelectedWardId] = useState<string | null>(null);
  const [reportFilter, setReportFilter] = useState<MapFilter>("all");
  const { activeMunicipality } = useMunicipalityStore();

  const { data, loading, error, refetch } = useQuery<MunicipalityTransparencyData>(
    GET_MUNICIPALITY_TRANSPARENCY,
    {
      variables: { municipality_id: activeMunicipality?.id ?? null },
      fetchPolicy: "cache-and-network",
    },
  );

  const overview = data?.municipalityTransparencyOverview ?? null;
  const selectedWard =
    overview?.wards.find((ward) => ward.id === selectedWardId) ?? null;

  const visibleReports = useMemo(
    () =>
      filterReports(
        overview?.reports ?? [],
        reportFilter,
        selectedWardId,
      ),
    [overview?.reports, reportFilter, selectedWardId],
  );

  if (loading && !overview) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex items-center gap-3 rounded-2xl border border-gray-200 bg-white px-5 py-4 text-sm text-gray-600">
          <LuLoaderCircle className="animate-spin text-base" />
          Loading municipality map
        </div>
      </div>
    );
  }

  if (error || !overview) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-6">
        <div className="flex items-start gap-3">
          <LuTriangleAlert className="mt-0.5 text-lg text-red-600" />
          <div className="space-y-3">
            <div>
              <h2 className="text-lg font-semibold text-red-900">
                Failed to load municipality map
              </h2>
              <p className="mt-1 text-sm text-red-700">
                {error?.message ?? "Map data is unavailable right now."}
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void refetch()}
              leftIcon={<LuRefreshCw />}
              className="border-red-200 bg-white text-red-700 hover:bg-red-100"
            >
              Retry
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-gray-200 bg-white p-6">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl">
            <p className="text-sm font-medium text-gray-500">Municipality map</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight text-gray-900">
              Ward borders, municipality outline, and every mapped task
            </h1>
            <p className="mt-3 text-sm leading-6 text-gray-600">
              Switch between all wards or a single ward, then inspect every task
              with location data. Ward borders stay highlighted and the municipality
              outline is always visible for scope context.
            </p>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600">
            Last refreshed {formatDateTime(overview.generated_at)}
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-gray-200 bg-white p-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <select
              value={selectedWardId ?? ""}
              onChange={(event) =>
                setSelectedWardId(event.target.value || null)
              }
              className="h-11 rounded-xl border border-gray-200 bg-white px-3 text-sm text-gray-700 outline-none transition-colors focus:border-gray-400"
            >
              <option value="">All wards in municipality</option>
              {overview.wards.map((ward) => (
                <option key={ward.id} value={ward.id}>
                  {ward.name} ({ward.ward_code})
                </option>
              ))}
            </select>

            <div className="flex flex-wrap gap-2">
              {FILTER_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setReportFilter(option.value)}
                  className={`rounded-xl border px-3 py-2 text-sm font-medium transition-colors ${
                    reportFilter === option.value
                      ? "border-gray-900 bg-gray-900 text-white"
                      : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => void refetch()}
            leftIcon={<LuRefreshCw />}
          >
            Refresh
          </Button>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <MunicipalityScopeMap
          wards={overview.wards}
          reports={overview.reports}
          municipalityBoundary={overview.municipality_boundary_geojson}
          selectedWardId={selectedWardId}
          onSelectWard={setSelectedWardId}
          reportFilter={reportFilter}
        />

        <div className="space-y-4">
          <div className="rounded-2xl border border-gray-200 bg-white p-5">
            <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
              <LuMapPinned className="text-base text-blue-600" />
              {selectedWard
                ? `${selectedWard.name} overview`
                : "Municipality scope overview"}
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-3">
                <p className="text-[11px] uppercase tracking-[0.18em] text-gray-500">
                  Visible tasks
                </p>
                <p className="mt-1 text-xl font-semibold text-gray-900">
                  {visibleReports.length}
                </p>
              </div>
              <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-3">
                <p className="text-[11px] uppercase tracking-[0.18em] text-gray-500">
                  Upvotes in scope
                </p>
                <p className="mt-1 text-xl font-semibold text-gray-900">
                  {selectedWard
                    ? selectedWard.total_upvotes
                    : overview.summary.total_upvotes}
                </p>
              </div>
              <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-3">
                <p className="text-[11px] uppercase tracking-[0.18em] text-gray-500">
                  Completed
                </p>
                <p className="mt-1 text-xl font-semibold text-gray-900">
                  {selectedWard
                    ? selectedWard.completed_reports
                    : overview.summary.completed_reports}
                </p>
              </div>
              <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-3">
                <p className="text-[11px] uppercase tracking-[0.18em] text-gray-500">
                  Overdue
                </p>
                <p className="mt-1 text-xl font-semibold text-gray-900">
                  {selectedWard
                    ? selectedWard.overdue_reports
                    : overview.summary.overdue_reports}
                </p>
              </div>
            </div>

            {selectedWard ? (
              <div className="mt-4 space-y-3 text-sm text-gray-600">
                <div className="flex items-center justify-between">
                  <span>Ward code</span>
                  <strong className="font-semibold text-gray-900">
                    {selectedWard.ward_code}
                  </strong>
                </div>
                <div className="flex items-center justify-between">
                  <span>Average public rating</span>
                  <strong className="font-semibold text-gray-900">
                    {selectedWard.average_public_rating.toFixed(1)} / 5
                  </strong>
                </div>
                <div className="flex items-center justify-between">
                  <span>Ward officers</span>
                  <strong className="font-semibold text-gray-900">
                    {selectedWard.ward_officer_count}
                  </strong>
                </div>
                <div className="flex items-center justify-between">
                  <span>Escalated to municipality</span>
                  <strong className="font-semibold text-gray-900">
                    {selectedWard.escalated_reports}
                  </strong>
                </div>
              </div>
            ) : (
              <div className="mt-4 space-y-3 text-sm text-gray-600">
                <div className="flex items-center justify-between">
                  <span>Active wards</span>
                  <strong className="font-semibold text-gray-900">
                    {overview.summary.active_wards}
                  </strong>
                </div>
                <div className="flex items-center justify-between">
                  <span>Ward officers</span>
                  <strong className="font-semibold text-gray-900">
                    {overview.summary.ward_officer_count}
                  </strong>
                </div>
                <div className="flex items-center justify-between">
                  <span>Municipality officers</span>
                  <strong className="font-semibold text-gray-900">
                    {overview.summary.municipality_officer_count}
                  </strong>
                </div>
                <div className="flex items-center justify-between">
                  <span>Average public rating</span>
                  <strong className="font-semibold text-gray-900">
                    {overview.summary.average_public_rating.toFixed(1)} / 5
                  </strong>
                </div>
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-5">
            <p className="text-sm font-semibold text-gray-900">Map legend</p>
            <div className="mt-4 space-y-3 text-sm text-gray-600">
              {Object.entries(STATUS_COLORS).map(([status, color]) => (
                <div key={status} className="flex items-center gap-3">
                  <span
                    className="h-3 w-3 rounded-full"
                    style={{ backgroundColor: color }}
                  />
                  <span>{status.replace(/_/g, " ")}</span>
                </div>
              ))}
              <div className="flex items-center gap-3">
                <span className="h-3 w-3 rounded-full border border-blue-600 bg-blue-100" />
                <span>Selected ward highlight</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="h-0 w-6 border-t-2 border-dashed border-slate-900" />
                <span>Municipality border</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-gray-200 bg-white">
        <div className="border-b border-gray-100 px-5 py-4">
          <p className="text-sm font-semibold text-gray-900">Visible task list</p>
          <p className="mt-1 text-xs text-gray-500">
            The table below follows the current ward and task filters applied on
            the map.
          </p>
        </div>

        {visibleReports.length === 0 ? (
          <div className="px-5 py-10 text-sm text-gray-500">
            No mapped tasks match the current filters.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-100 text-sm">
              <thead className="bg-gray-50 text-left text-xs uppercase tracking-[0.16em] text-gray-500">
                <tr>
                  <th className="px-5 py-3 font-medium">Task</th>
                  <th className="px-5 py-3 font-medium">Ward</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 font-medium">Upvotes</th>
                  <th className="px-5 py-3 font-medium">Updated</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {visibleReports.slice(0, 14).map((report) => (
                  <tr key={report.id}>
                    <td className="px-5 py-3">
                      <div className="font-medium text-gray-900">{report.title}</div>
                      <div className="text-xs text-gray-500">{report.category}</div>
                    </td>
                    <td className="px-5 py-3 text-gray-600">
                      {report.ward_name} ({report.ward_code})
                    </td>
                    <td className="px-5 py-3 text-gray-600">
                      {report.status.replace(/_/g, " ")}
                    </td>
                    <td className="px-5 py-3 font-medium text-gray-900">
                      {report.upvote_count}
                    </td>
                    <td className="px-5 py-3 text-gray-600">
                      {formatDateTime(report.updated_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
