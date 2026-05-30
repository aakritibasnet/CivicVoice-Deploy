"use client";

import { useDeferredValue, useMemo, useState } from "react";
import { useQuery } from "@apollo/client/react";
import {
  LuLoaderCircle,
  LuRefreshCw,
  LuSearch,
  LuTriangleAlert,
} from "react-icons/lu";
import { GET_MUNICIPALITY_TRANSPARENCY } from "@/src/graphql/operations/municipality";
import type {
  MunicipalityTransparencyData,
  MunicipalityWardOverview,
} from "@/src/types/municipality";
import { Button } from "@/src/ui/Button";
import { useMunicipalityStore } from "@/src/store/municipality-store";

type SortKey =
  | "reports"
  | "upvotes"
  | "rating"
  | "overdue"
  | "completion";

const SORT_OPTIONS: Array<{ value: SortKey; label: string }> = [
  { value: "reports", label: "Most reports" },
  { value: "upvotes", label: "Most upvotes" },
  { value: "rating", label: "Highest rating" },
  { value: "overdue", label: "Most overdue" },
  { value: "completion", label: "Best completion" },
];

function formatDateTime(value: string | null) {
  if (!value) return "No recent activity";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function completionRate(ward: MunicipalityWardOverview) {
  if (ward.report_count === 0) return 0;
  return Math.round((ward.completed_reports / ward.report_count) * 100);
}

function SummaryTile({
  label,
  value,
  subtext,
}: {
  label: string;
  value: string | number;
  subtext?: string;
}) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4">
      <p className="text-xs uppercase tracking-[0.18em] text-gray-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-gray-900">{value}</p>
      {subtext ? <p className="mt-1 text-sm text-gray-500">{subtext}</p> : null}
    </div>
  );
}

function WardMetric({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-3">
      <p className="text-[11px] uppercase tracking-[0.18em] text-gray-500">{label}</p>
      <p className="mt-1 text-lg font-semibold text-gray-900">{value}</p>
    </div>
  );
}

export default function MunicipalityWardsPage() {
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<SortKey>("reports");
  const deferredSearch = useDeferredValue(search.trim().toLowerCase());
  const { activeMunicipality } = useMunicipalityStore();

  const { data, loading, error, refetch } = useQuery<MunicipalityTransparencyData>(
    GET_MUNICIPALITY_TRANSPARENCY,
    {
      variables: { municipality_id: activeMunicipality?.id ?? null },
      fetchPolicy: "cache-and-network",
    },
  );

  const overview = data?.municipalityTransparencyOverview ?? null;

  const wards = useMemo(() => {
    const source = overview?.wards ?? [];

    const filtered = source.filter((ward) => {
      if (!deferredSearch) return true;
      return [
        ward.name,
        ward.ward_code,
        ward.contact_email ?? "",
        ward.contact_phone ?? "",
        ...ward.officers.map((officer) =>
          `${officer.first_name} ${officer.last_name} ${officer.department_name}`,
        ),
      ]
        .join(" ")
        .toLowerCase()
        .includes(deferredSearch);
    });

    return [...filtered].sort((left, right) => {
      if (sortBy === "upvotes") {
        return right.total_upvotes - left.total_upvotes;
      }

      if (sortBy === "rating") {
        return right.average_public_rating - left.average_public_rating;
      }

      if (sortBy === "overdue") {
        return right.overdue_reports - left.overdue_reports;
      }

      if (sortBy === "completion") {
        return completionRate(right) - completionRate(left);
      }

      return right.report_count - left.report_count;
    });
  }, [deferredSearch, overview?.wards, sortBy]);

  if (loading && !overview) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex items-center gap-3 rounded-2xl border border-gray-200 bg-white px-5 py-4 text-sm text-gray-600">
          <LuLoaderCircle className="animate-spin text-base" />
          Loading ward transparency view
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
                Failed to load municipality wards
              </h2>
              <p className="mt-1 text-sm text-red-700">
                {error?.message ?? "Ward transparency data is unavailable right now."}
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
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <p className="text-sm font-medium text-gray-500">Municipality wards</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight text-gray-900">
              Full ward visibility with officer and engagement context
            </h1>
            <p className="mt-3 text-sm leading-6 text-gray-600">
              Review every ward in scope, compare report pressure, see which ward
              officers are carrying the workload, and track the public response
              through upvotes and completion ratings.
            </p>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600">
            Generated {formatDateTime(overview.generated_at)}
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-7">
        <SummaryTile
          label="Active wards"
          value={overview.summary.active_wards}
          subtext={`${overview.summary.ward_officer_count} ward officers in view`}
        />
        <SummaryTile
          label="Total reports"
          value={overview.summary.total_reports}
          subtext={`${overview.summary.escalated_reports} escalated`}
        />
        <SummaryTile
          label="In progress"
          value={overview.summary.in_progress_reports}
          subtext={`${overview.summary.pending_reports} still incoming`}
        />
        <SummaryTile
          label="Completed"
          value={overview.summary.completed_reports}
          subtext={`${overview.summary.overdue_reports} overdue right now`}
        />
        <SummaryTile
          label="Avg. happiness"
          value={`${overview.summary.average_happiness_score}%`}
          subtext="Workflow penalties reflected automatically"
        />
        <SummaryTile
          label="Total upvotes"
          value={overview.summary.total_upvotes}
          subtext={`${overview.summary.published_post_count} public completion posts`}
        />
        <SummaryTile
          label="Average rating"
          value={overview.summary.average_public_rating.toFixed(1)}
          subtext={`${overview.summary.total_ratings} ratings across wards`}
        />
      </section>

      <section className="rounded-2xl border border-gray-200 bg-white p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative w-full max-w-md">
            <LuSearch className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search ward, officer, email or phone"
              className="h-11 w-full rounded-xl border border-gray-200 bg-white pl-9 pr-3 text-sm text-gray-700 outline-none transition-colors focus:border-gray-400"
            />
          </div>

          <div className="flex items-center gap-3">
            <select
              value={sortBy}
              onChange={(event) => setSortBy(event.target.value as SortKey)}
              className="h-11 rounded-xl border border-gray-200 bg-white px-3 text-sm text-gray-700 outline-none transition-colors focus:border-gray-400"
            >
              {SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>

            <Button
              variant="outline"
              size="sm"
              onClick={() => void refetch()}
              leftIcon={<LuRefreshCw />}
            >
              Refresh
            </Button>
          </div>
        </div>
      </section>

      <section className="space-y-5">
        {wards.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gray-300 bg-gray-50 px-6 py-14 text-center text-sm text-gray-500">
            No wards match the current search.
          </div>
        ) : null}

        {wards.map((ward) => (
          <article
            key={ward.id}
            className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm"
          >
            <div className="flex flex-col gap-4 border-b border-gray-100 pb-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500">{ward.ward_code}</p>
                <h2 className="mt-1 text-2xl font-semibold text-gray-900">
                  {ward.name}
                </h2>
                <div className="mt-3 flex flex-col gap-1 text-sm text-gray-600">
                  <span>{ward.contact_email || "No contact email"}</span>
                  <span>{ward.contact_phone || "No contact phone"}</span>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-gray-500">
                    Completion rate
                  </p>
                  <p className="mt-1 text-2xl font-semibold text-gray-900">
                    {completionRate(ward)}%
                  </p>
                </div>
                <div className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-gray-500">
                    Latest activity
                  </p>
                  <p className="mt-1 text-sm font-medium text-gray-900">
                    {formatDateTime(ward.latest_activity_at)}
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-9">
              <WardMetric label="Reports" value={ward.report_count} />
              <WardMetric label="Pending" value={ward.pending_reports} />
              <WardMetric label="Active" value={ward.in_progress_reports} />
              <WardMetric label="Completed" value={ward.completed_reports} />
              <WardMetric label="Escalated" value={ward.escalated_reports} />
              <WardMetric label="Overdue" value={ward.overdue_reports} />
              <WardMetric label="Happiness" value={`${ward.happiness_score}%`} />
              <WardMetric label="Upvotes" value={ward.total_upvotes} />
              <WardMetric
                label="Rating"
                value={`${ward.average_public_rating.toFixed(1)} / 5`}
              />
            </div>

            <div className="mt-5 grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
              <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                <p className="text-sm font-semibold text-gray-900">
                  Ward transparency notes
                </p>
                <div className="mt-4 space-y-3 text-sm text-gray-600">
                  <div className="flex items-center justify-between">
                    <span>Published completion posts</span>
                    <strong className="font-semibold text-gray-900">
                      {ward.published_post_count}
                    </strong>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Total public ratings</span>
                    <strong className="font-semibold text-gray-900">
                      {ward.total_ratings}
                    </strong>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Ward officers listed</span>
                    <strong className="font-semibold text-gray-900">
                      {ward.ward_officer_count}
                    </strong>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Returned reports</span>
                    <strong className="font-semibold text-gray-900">
                      {ward.returned_reports}
                    </strong>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Invalid reports</span>
                    <strong className="font-semibold text-gray-900">
                      {ward.invalid_reports}
                    </strong>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-gray-200 bg-white">
                <div className="border-b border-gray-100 px-4 py-3">
                  <p className="text-sm font-semibold text-gray-900">
                    Officers in this ward
                  </p>
                  <p className="mt-1 text-xs text-gray-500">
                    Assignment counts reflect tasks currently linked to each ward
                    officer.
                  </p>
                </div>

                {ward.officers.length === 0 ? (
                  <div className="px-4 py-8 text-sm text-gray-500">
                    No ward officers are listed for this ward yet.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-100 text-sm">
                      <thead className="bg-gray-50 text-left text-xs uppercase tracking-[0.16em] text-gray-500">
                        <tr>
                          <th className="px-4 py-3 font-medium">Officer</th>
                          <th className="px-4 py-3 font-medium">Department</th>
                          <th className="px-4 py-3 font-medium">Contact</th>
                          <th className="px-4 py-3 font-medium">Assigned</th>
                          <th className="px-4 py-3 font-medium">Active</th>
                          <th className="px-4 py-3 font-medium">Done</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {ward.officers.map((officer) => (
                          <tr key={officer.id} className="align-top">
                            <td className="px-4 py-3">
                              <div className="font-medium text-gray-900">
                                {officer.first_name} {officer.last_name}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-gray-600">
                              {officer.department_name}
                            </td>
                            <td className="px-4 py-3 text-gray-600">
                              <div>{officer.email || "No email"}</div>
                              <div>{officer.phone_number || "No phone"}</div>
                            </td>
                            <td className="px-4 py-3 font-medium text-gray-900">
                              {officer.assigned_report_count}
                            </td>
                            <td className="px-4 py-3 font-medium text-gray-900">
                              {officer.active_report_count}
                            </td>
                            <td className="px-4 py-3 font-medium text-gray-900">
                              {officer.completed_report_count}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}
