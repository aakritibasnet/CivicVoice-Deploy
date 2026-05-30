"use client";

import Link from "next/link";
import {
  LuArrowUp,
  LuClock3,
  LuExternalLink,
  LuFileWarning,
  LuMapPin,
  LuMessageSquare,
  LuRefreshCcw,
  LuShieldAlert,
} from "react-icons/lu";
import type { PublicTaskReport } from "@/src/types/report-posts";

interface TaskFeedCardProps {
  report: PublicTaskReport;
}

function formatTimeAgo(value: string) {
  const date = new Date(value);
  const diffMs = Date.now() - date.getTime();
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));

  if (diffHours < 1) {
    return "Just now";
  }

  if (diffHours < 24) {
    return `${diffHours}h ago`;
  }

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) {
    return `${diffDays}d ago`;
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function getStatusLabel(status: PublicTaskReport["status"]) {
  switch (status) {
    case "incoming":
      return "Incoming";
    case "in_progress":
      return "In Progress";
    case "returned":
      return "Returned";
    case "invalid":
      return "Invalid";
    case "completed":
      return "Completed";
    default:
      return status;
  }
}

function getStatusTone(status: PublicTaskReport["status"]) {
  switch (status) {
    case "incoming":
      return "bg-sky-50 text-sky-700";
    case "in_progress":
      return "bg-amber-50 text-amber-700";
    case "returned":
      return "bg-orange-50 text-orange-700";
    case "invalid":
      return "bg-rose-50 text-rose-700";
    default:
      return "bg-gray-100 text-gray-600";
  }
}

function getPrimaryReason(report: PublicTaskReport) {
  if (report.escalated_to_municipality) {
    return {
      icon: <LuShieldAlert className="h-3.5 w-3.5" />,
      label:
        report.escalation_type === "report_not_seen"
          ? "Report not seen"
          : report.escalation_type === "deadline_missed"
            ? "Deadline missed"
            : "Escalation reason",
      body: report.pathway_reason,
      tone: "border-violet-200 bg-violet-50 text-violet-900",
    };
  }

  if (report.status === "invalid" && report.return_reasoning) {
    return {
      icon: <LuFileWarning className="h-3.5 w-3.5" />,
      label: "Marked invalid",
      body: report.return_reasoning,
      tone: "border-rose-200 bg-rose-50 text-rose-900",
    };
  }

  if (report.status === "returned" && report.return_instructions) {
    return {
      icon: <LuRefreshCcw className="h-3.5 w-3.5" />,
      label: "Returned instructions",
      body: report.return_instructions,
      tone: "border-orange-200 bg-orange-50 text-orange-900",
    };
  }

  return null;
}

export default function TaskFeedCard({ report }: TaskFeedCardProps) {
  const thumbnailUrl =
    report.media_url ||
    (Array.isArray(report.photo_urls) ? report.photo_urls[0] : null) ||
    null;
  const reason = getPrimaryReason(report);

  return (
    <article className="overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-sm shadow-gray-100/60">
      {thumbnailUrl ? (
        <Link
          href={`/reports/${report.id}`}
          className="block aspect-[16/9] overflow-hidden bg-gray-100"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={thumbnailUrl}
            alt={report.title}
            className="h-full w-full object-cover transition-transform duration-300 hover:scale-[1.02]"
          />
        </Link>
      ) : null}

      <div className="space-y-4 px-5 py-5 sm:px-6">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${getStatusTone(report.status)}`}
          >
            {getStatusLabel(report.status)}
          </span>
          {report.escalated_to_municipality ? (
            <span className="inline-flex items-center rounded-full bg-violet-50 px-3 py-1 text-xs font-medium text-violet-700">
              Escalated
            </span>
          ) : null}
          {report.ward ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-600">
              <LuMapPin className="h-3 w-3" />
              {report.ward.name}
            </span>
          ) : null}
          <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-600">
            {report.category}
          </span>
        </div>

        <div className="space-y-1.5">
          <Link href={`/reports/${report.id}`} className="block">
            <h2 className="text-lg font-semibold tracking-tight text-gray-900 transition-colors hover:text-gray-600">
              {report.title}
            </h2>
          </Link>
          {report.description ? (
            <p className="text-sm leading-relaxed text-gray-500">
              {report.description}
            </p>
          ) : null}
        </div>

        {reason ? (
          <div className={`rounded-2xl border px-4 py-3 ${reason.tone}`}>
            <div className="flex items-center gap-2 text-sm font-medium">
              {reason.icon}
              <span>{reason.label}</span>
            </div>
            {reason.body ? (
              <p className="mt-2 text-sm leading-relaxed opacity-90">
                {reason.body}
              </p>
            ) : null}
          </div>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-gray-50 px-4 py-3">
          <div className="flex items-center gap-4 text-sm text-gray-500">
            <span className="inline-flex items-center gap-1.5">
              <LuArrowUp className="h-3.5 w-3.5" />
              {report.upvote_count}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <LuMessageSquare className="h-3.5 w-3.5" />
              {report.comment_count}
            </span>
          </div>

          <span className="inline-flex items-center gap-1.5 text-xs text-gray-400">
            <LuClock3 className="h-3.5 w-3.5" />
            {formatTimeAgo(report.updated_at || report.submitted_at)}
          </span>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 pt-4">
          <div className="min-w-0 text-sm text-gray-500">
            {report.address_text ? (
              <p className="truncate">{report.address_text}</p>
            ) : (
              <p>Open the task to see the full workflow and discussion.</p>
            )}
          </div>

          <Link
            href={`/reports/${report.id}`}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-gray-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-700"
          >
            Open task
            <LuExternalLink className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>
    </article>
  );
}
