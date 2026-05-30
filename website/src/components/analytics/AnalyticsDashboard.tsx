"use client";

import Link from "next/link";
import React, { useMemo, useState } from "react";
import { useQuery } from "@apollo/client/react";
import {
  LuAlarmClockCheck,
  LuBadgeCheck,
  LuCalendarRange,
  LuChartColumn,
  LuCheckCheck,
  LuClock3,
  LuFileText,
  LuLoaderCircle,
  LuRefreshCw,
  LuTriangleAlert,
} from "react-icons/lu";

import { GET_DASHBOARD_ANALYTICS } from "@/src/graphql/operations/analytics";
import { useAuthStore } from "@/src/store/auth-store";
import { Button } from "@/src/ui/Button";
import type {
  AnalyticsCategoryBreakdown,
  AnalyticsStatusBreakdown,
  AnalyticsTimelinePoint,
  AnalyticsTopTask,
  DashboardAnalyticsData,
  PublishedAnalyticsReport,
} from "@/src/types/analytics";

const ANALYTICS_PERIOD_DAYS = 7;

const statusColorMap: Record<string, string> = {
  incoming: "#2563eb",
  in_progress: "#d97706",
  completed: "#059669",
  invalid: "#dc2626",
  returned: "#7c3aed",
};

function formatStatusLabel(status: string) {
  return status
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatDateRange(start: string, end: string) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  });
  const endDate = new Date(end);
  endDate.setDate(endDate.getDate() - 1);

  return `${formatter.format(new Date(start))} - ${formatter.format(endDate)}`;
}

function formatLongDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatShortDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}

function formatDuration(hours: number) {
  if (!hours) return "No completed tasks yet";
  if (hours < 24) return `${Math.round(hours)} hours`;

  const days = Math.round((hours / 24) * 10) / 10;
  return `${days} days`;
}

function MetricCard({
  label,
  value,
  helper,
  icon,
}: {
  label: string;
  value: string | number;
  helper: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-gray-500">{label}</p>
        <div className="rounded-full bg-gray-100 p-2 text-gray-600">{icon}</div>
      </div>
      <p className="mt-4 text-3xl font-semibold text-gray-900">{value}</p>
      <p className="mt-2 text-sm text-gray-500">{helper}</p>
    </div>
  );
}

function CategoryList({
  categories,
}: {
  categories: AnalyticsCategoryBreakdown[];
}) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5">
      <div className="mb-4">
        <p className="text-sm font-medium text-gray-500">Top Categories</p>
        <h2 className="mt-1 text-xl font-semibold text-gray-900">
          Categories by issues reported
        </h2>
      </div>

      <div className="space-y-3">
        {categories.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-4 py-8 text-center text-sm text-gray-500">
            No category data is available for this period.
          </div>
        ) : (
          categories.map((category) => (
            <div
              key={category.category}
              className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3"
            >
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="font-medium text-gray-900">
                  {category.category}
                </span>
                <span className="text-gray-600">
                  {category.count} issue{category.count === 1 ? "" : "s"} reported
                </span>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-white">
                <div
                  className="h-full rounded-full bg-slate-700"
                  style={{ width: `${Math.max(category.percentage, 6)}%` }}
                />
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function TopTasksList({
  tasks,
}: {
  tasks: AnalyticsTopTask[];
}) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-gray-500">Top-3 Upvoted Tasks</p>
          <h2 className="mt-1 text-xl font-semibold text-gray-900">
            Most supported by citizens
          </h2>
        </div>
        <Link
          href="/dashboard/reports"
          className="text-sm font-medium text-blue-700 hover:text-blue-800"
        >
          Open reports
        </Link>
      </div>

      <div className="space-y-3">
        {tasks.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-4 py-8 text-center text-sm text-gray-500">
            No tasks have received votes yet.
          </div>
        ) : (
          tasks.map((task, index) => (
            <div
              key={task.id}
              className="rounded-2xl border border-gray-200 bg-gray-50 p-4"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-400">
                    #{index + 1}
                  </p>
                  <h3 className="mt-1 text-base font-semibold text-gray-900">
                    {task.title}
                  </h3>
                </div>
                <span className="rounded-full bg-white px-3 py-1 text-xs font-medium text-gray-600">
                  {formatStatusLabel(task.status)}
                </span>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-gray-600">
                <span className="rounded-full bg-white px-3 py-1">
                  {task.category}
                </span>
                <span className="rounded-full bg-white px-3 py-1">
                  Reported {formatShortDate(task.created_at)}
                </span>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded-xl bg-white px-3 py-2">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-gray-400">
                    Upvotes
                  </p>
                  <p className="mt-1 text-lg font-semibold text-gray-900">
                    {task.upvote_count}
                  </p>
                </div>
                <div className="rounded-xl bg-white px-3 py-2">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-gray-400">
                    Comments
                  </p>
                  <p className="mt-1 text-lg font-semibold text-gray-900">
                    {task.comment_count}
                  </p>
                </div>
                <div className="col-span-2 rounded-xl bg-white px-3 py-2 text-sm text-gray-600">
                  Full task details are available in the reports page.
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function ThroughputChart({
  timeline,
}: {
  timeline: AnalyticsTimelinePoint[];
}) {
  const maxValue = Math.max(
    1,
    ...timeline.flatMap((point) => [point.created_count, point.completed_count]),
  );

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5">
      <div className="mb-4">
        <p className="text-sm font-medium text-gray-500">Weekly Flow</p>
        <h2 className="mt-1 text-xl font-semibold text-gray-900">
          Issues reported vs completed
        </h2>
      </div>

      <div className="space-y-3">
        {timeline.map((point) => (
          <div key={point.date} className="grid grid-cols-[72px_1fr] items-center gap-4">
            <div className="text-sm text-gray-500">{formatShortDate(point.date)}</div>
            <div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="mb-1 flex items-center justify-between text-xs text-gray-500">
                    <span>Reported</span>
                    <span>{point.created_count}</span>
                  </div>
                  <div className="h-2.5 overflow-hidden rounded-full bg-gray-100">
                    <div
                      className="h-full rounded-full bg-blue-600"
                      style={{
                        width: `${Math.max((point.created_count / maxValue) * 100, point.created_count > 0 ? 10 : 0)}%`,
                      }}
                    />
                  </div>
                </div>
                <div>
                  <div className="mb-1 flex items-center justify-between text-xs text-gray-500">
                    <span>Completed</span>
                    <span>{point.completed_count}</span>
                  </div>
                  <div className="h-2.5 overflow-hidden rounded-full bg-gray-100">
                    <div
                      className="h-full rounded-full bg-emerald-600"
                      style={{
                        width: `${Math.max((point.completed_count / maxValue) * 100, point.completed_count > 0 ? 10 : 0)}%`,
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function StatusBars({
  breakdown,
}: {
  breakdown: AnalyticsStatusBreakdown[];
}) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5">
      <div className="mb-4">
        <p className="text-sm font-medium text-gray-500">Status Mix</p>
        <h2 className="mt-1 text-xl font-semibold text-gray-900">
          Current task distribution
        </h2>
      </div>

      <div className="space-y-4">
        {breakdown.map((item) => (
          <div key={item.status}>
            <div className="mb-1.5 flex items-center justify-between text-sm">
              <span className="font-medium text-gray-700">
                {formatStatusLabel(item.status)}
              </span>
              <span className="text-gray-500">
                {item.count} tasks ({item.percentage}%)
              </span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-gray-100">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${Math.max(item.percentage, item.count > 0 ? 8 : 0)}%`,
                  backgroundColor: statusColorMap[item.status],
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function WeeklyNotes({
  items,
}: {
  items: Array<{ label: string; value: string; detail: string }>;
}) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5">
      <div className="mb-4">
        <p className="text-sm font-medium text-gray-500">Worth Knowing</p>
        <h2 className="mt-1 text-xl font-semibold text-gray-900">
          This week at a glance
        </h2>
      </div>

      <div className="space-y-3">
        {items.map((item) => (
          <div
            key={item.label}
            className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3"
          >
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-medium text-gray-900">{item.label}</p>
              <p className="text-lg font-semibold text-gray-900">{item.value}</p>
            </div>
            <p className="mt-1 text-sm text-gray-500">{item.detail}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function PublishedReportCard({
  report,
  active,
  onSelect,
}: {
  report: PublishedAnalyticsReport;
  active: boolean;
  onSelect: (reportId: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(report.id)}
      className={`w-full rounded-2xl border p-4 text-left transition-colors ${
        active
          ? "border-slate-900 bg-slate-50"
          : "border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50"
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-gray-900">{report.title}</p>
          <p className="mt-1 text-xs text-gray-500">
            {formatDateRange(report.period_start, report.period_end)}
          </p>
        </div>
        <span className="rounded-full bg-gray-100 px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-gray-600">
          {report.period_days}D
        </span>
      </div>

      <p className="mt-3 text-sm text-gray-600">{report.narrative}</p>

      <div className="mt-4 grid grid-cols-3 gap-2">
        <div className="rounded-xl bg-gray-50 px-3 py-2">
          <p className="text-[11px] uppercase tracking-[0.18em] text-gray-400">
            Issues
          </p>
          <p className="mt-1 text-lg font-semibold text-gray-900">
            {report.summary.total_reports}
          </p>
        </div>
        <div className="rounded-xl bg-gray-50 px-3 py-2">
          <p className="text-[11px] uppercase tracking-[0.18em] text-gray-400">
            Completed
          </p>
          <p className="mt-1 text-lg font-semibold text-gray-900">
            {report.summary.completed_reports}
          </p>
        </div>
        <div className="rounded-xl bg-gray-50 px-3 py-2">
          <p className="text-[11px] uppercase tracking-[0.18em] text-gray-400">
            Rate
          </p>
          <p className="mt-1 text-lg font-semibold text-gray-900">
            {report.summary.completion_rate}%
          </p>
        </div>
      </div>
    </button>
  );
}

function PublishedReportPreview({
  report,
}: {
  report: PublishedAnalyticsReport | null;
}) {
  if (!report) {
    return (
      <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-6 py-16 text-center text-sm text-gray-500">
        Weekly analytics reports publish automatically every 7 days.
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-gray-500">Published Report</p>
          <h2 className="mt-1 text-xl font-semibold text-gray-900">
            {report.title}
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            {formatDateRange(report.period_start, report.period_end)}
          </p>
        </div>
        <p className="text-sm text-gray-500">
          Published {formatLongDate(report.created_at)}
        </p>
      </div>

      <div className="mt-4 rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
        {report.narrative}
      </div>

      <div className="mt-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <MetricCard
          label="Completion Rate"
          value={`${report.summary.completion_rate}%`}
          helper="Share of tasks completed in that report."
          icon={<LuBadgeCheck />}
        />
        <MetricCard
          label="Average Time"
          value={formatDuration(report.summary.avg_resolution_hours)}
          helper="Average time taken to finish completed tasks."
          icon={<LuClock3 />}
        />
        <MetricCard
          label="Overdue"
          value={report.summary.overdue_reports}
          helper="Tasks that were still past deadline."
          icon={<LuTriangleAlert />}
        />
        <MetricCard
          label="Reported"
          value={report.summary.window_created_reports}
          helper="Issues reported during that 7-day window."
          icon={<LuFileText />}
        />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-2">
        <CategoryList categories={report.category_breakdown} />
        <TopTasksList tasks={report.top_upvoted_tasks} />
      </div>
    </div>
  );
}

export default function AnalyticsDashboard() {
  const user = useAuthStore((state) => state.user);
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const isWardUser = user?.role === "ward";

  const { data, loading, error, refetch } = useQuery<DashboardAnalyticsData>(
    GET_DASHBOARD_ANALYTICS,
    {
      variables: { days: ANALYTICS_PERIOD_DAYS },
      fetchPolicy: "cache-and-network",
    },
  );

  const analytics = data?.dashboardAnalytics ?? null;
  const publishedReports = useMemo(
    () => analytics?.published_reports ?? [],
    [analytics],
  );
  const latestPublishedReport = publishedReports[0] ?? null;

  const selectedReport = useMemo(
    () =>
      publishedReports.find((report) => report.id === selectedReportId) ??
      publishedReports[0] ??
      null,
    [publishedReports, selectedReportId],
  );

  const nextAutoPublishAt = useMemo(() => {
    if (!latestPublishedReport) return null;

    return new Date(
      new Date(latestPublishedReport.created_at).getTime() +
        ANALYTICS_PERIOD_DAYS * 24 * 60 * 60 * 1000,
    );
  }, [latestPublishedReport]);

  const weeklyNotes = useMemo(() => {
    if (!analytics) return [];

    return [
      {
        label: "Issues reported this week",
        value: String(analytics.summary.window_created_reports),
        detail: "New citizen reports received during the current 7-day window.",
      },
      {
        label: "Tasks completed this week",
        value: String(analytics.summary.window_completed_reports),
        detail: "Tasks finished within the same reporting period.",
      },
      {
        label: "Tasks still active",
        value: `${analytics.summary.active_rate}%`,
        detail: "Share of tasks that are still pending or in progress.",
      },
      {
        label: "Next automatic publish",
        value: nextAutoPublishAt
          ? formatShortDate(nextAutoPublishAt.toISOString())
          : `In ${ANALYTICS_PERIOD_DAYS} days`,
        detail: isWardUser
          ? "Ward reports publish automatically. Manual publish is disabled."
          : "A new report is generated automatically after each 7-day cycle.",
      },
    ];
  }, [analytics, isWardUser, nextAutoPublishAt]);

  if (loading && !analytics) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex items-center gap-3 rounded-2xl border border-gray-200 bg-white px-5 py-4 text-sm text-gray-600">
          <LuLoaderCircle className="animate-spin text-base" />
          Loading analytics
        </div>
      </div>
    );
  }

  if (error || !analytics) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-6">
        <div className="flex items-start gap-3">
          <LuTriangleAlert className="mt-0.5 text-lg text-red-600" />
          <div className="space-y-3">
            <div>
              <h2 className="text-lg font-semibold text-red-900">
                Failed to load analytics
              </h2>
              <p className="mt-1 text-sm text-red-700">
                {error?.message ?? "Analytics data is unavailable right now."}
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
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div className="max-w-3xl">
            <p className="text-sm font-medium text-gray-500">Analytics</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight text-gray-900">
              Simple weekly task overview
            </h1>
            <p className="mt-3 text-sm leading-6 text-gray-600">
              This page highlights what matters most: how many issues were
              reported, what got completed, which categories are busiest, and
              which tasks are receiving the most public support.
            </p>

            <div className="mt-5 flex flex-wrap gap-3">
              <div className="rounded-full bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700">
                Fixed 7-day reporting window
              </div>
              <div className="rounded-full bg-blue-50 px-4 py-2 text-sm font-medium text-blue-700">
                {isWardUser
                  ? "Ward publishing is automatic"
                  : "Publishing runs automatically every 7 days"}
              </div>
            </div>
          </div>

          <div className="grid min-w-[260px] gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-gray-400">
                Generated
              </p>
              <p className="mt-2 text-base font-semibold text-gray-900">
                {formatLongDate(analytics.generated_at)}
              </p>
            </div>
            <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-gray-400">
                Next Publish
              </p>
              <p className="mt-2 text-base font-semibold text-gray-900">
                {nextAutoPublishAt
                  ? formatLongDate(nextAutoPublishAt.toISOString())
                  : `In ${ANALYTICS_PERIOD_DAYS} days`}
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <MetricCard
          label="Completion Rate"
          value={`${analytics.summary.completion_rate}%`}
          helper="How much of the total workload is already completed."
          icon={<LuBadgeCheck />}
        />
        <MetricCard
          label="Average Task Completion Time"
          value={formatDuration(analytics.summary.avg_resolution_hours)}
          helper="Average time taken to close completed tasks."
          icon={<LuClock3 />}
        />
        <MetricCard
          label="Issues Reported This Week"
          value={analytics.summary.window_created_reports}
          helper="New citizen issues received during the current 7-day window."
          icon={<LuFileText />}
        />
        <MetricCard
          label="Tasks Completed This Week"
          value={analytics.summary.window_completed_reports}
          helper="Tasks finished during the same reporting period."
          icon={<LuCheckCheck />}
        />
        <MetricCard
          label="Tasks Still Active"
          value={analytics.summary.in_progress_reports + analytics.summary.pending_reports}
          helper="Tasks that still need action or are currently in progress."
          icon={<LuChartColumn />}
        />
        <MetricCard
          label="Overdue Tasks"
          value={analytics.summary.overdue_reports}
          helper="Tasks that are still open past their deadline."
          icon={<LuTriangleAlert />}
        />
        <MetricCard
          label="Ward Happiness"
          value={`${analytics.summary.happiness_score}%`}
          helper="Current ward happiness after workflow penalties."
          icon={<LuBadgeCheck />}
        />
        <MetricCard
          label="Penalty Events"
          value={analytics.summary.happiness_penalty_total}
          helper="Total workflow penalty points applied so far."
          icon={<LuTriangleAlert />}
        />
      </section>

      <section className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <WeeklyNotes items={weeklyNotes} />
        <CategoryList categories={analytics.category_breakdown} />
      </section>

      <section className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <TopTasksList tasks={analytics.top_upvoted_tasks} />
        <StatusBars breakdown={analytics.status_breakdown} />
      </section>

      <section className="grid grid-cols-1 gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <ThroughputChart timeline={analytics.timeline} />

        <div className="rounded-2xl border border-gray-200 bg-white p-5">
          <div className="mb-4">
            <p className="text-sm font-medium text-gray-500">Publishing</p>
            <h2 className="mt-1 text-xl font-semibold text-gray-900">
              Weekly automatic report
            </h2>
          </div>

          <div className="space-y-3">
            <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
              <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
                <LuCalendarRange />
                Current period
              </div>
              <p className="mt-2 text-base font-semibold text-gray-900">
                {analytics.summary.window_created_reports} issues reported and{" "}
                {analytics.summary.window_completed_reports} tasks completed
              </p>
            </div>

            <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
              <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
                <LuAlarmClockCheck />
                Publishing rule
              </div>
              <p className="mt-2 text-sm text-gray-600">
                Reports are published automatically every 7 days. If no issues
                are reported in that period, the report still publishes with a
                clear no-issues message.
              </p>
            </div>

            <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
              <p className="text-sm font-medium text-gray-700">Latest report note</p>
              <p className="mt-2 text-sm text-gray-600">
                {latestPublishedReport?.narrative ??
                  "No published report yet. The first weekly report will appear automatically."}
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-gray-500">Published Reports</p>
            <h2 className="mt-1 text-2xl font-semibold text-gray-900">
              Weekly report history
            </h2>
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

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[0.8fr_1.2fr]">
          <div className="space-y-3">
            {publishedReports.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-6 py-10 text-center text-sm text-gray-500">
                No published reports yet. Weekly analytics reports will appear
                here automatically every 7 days.
              </div>
            ) : (
              publishedReports.map((report) => (
                <PublishedReportCard
                  key={report.id}
                  report={report}
                  active={report.id === selectedReport?.id}
                  onSelect={setSelectedReportId}
                />
              ))
            )}
          </div>

          <PublishedReportPreview report={selectedReport} />
        </div>
      </section>
    </div>
  );
}
