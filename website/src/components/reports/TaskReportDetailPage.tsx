"use client";

import Link from "next/link";
import {
  LuArrowLeft,
  LuArrowUp,
  LuClock3,
  LuMapPin,
  LuMessageSquare,
  LuRefreshCcw,
  LuShare2,
  LuShieldAlert,
} from "react-icons/lu";
import type { PublicTaskReport } from "@/src/types/report-posts";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date(value));
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

  return formatDate(value);
}

function getStatusLabel(report: PublicTaskReport) {
  if (report.escalated_to_municipality) {
    return "Escalated";
  }

  switch (report.status) {
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
      return report.status;
  }
}

function getStatusTone(report: PublicTaskReport) {
  if (report.escalated_to_municipality) {
    return "bg-violet-50 text-violet-700";
  }

  switch (report.status) {
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

function getReasonBlock(report: PublicTaskReport) {
  if (report.escalated_to_municipality) {
    return {
      title:
        report.escalation_type === "report_not_seen"
          ? "Report not seen"
          : report.escalation_type === "deadline_missed"
            ? "Deadline missed"
            : "Escalation note",
      body: report.pathway_reason,
      tone: "border-violet-200 bg-violet-50 text-violet-900",
      icon: <LuShieldAlert className="h-4 w-4" />,
    };
  }

  if (report.status === "returned") {
    return {
      title: "Returned to ward",
      body: report.return_instructions ?? report.return_reasoning,
      tone: "border-orange-200 bg-orange-50 text-orange-900",
      icon: <LuRefreshCcw className="h-4 w-4" />,
    };
  }

  if (report.status === "invalid") {
    return {
      title: "Marked invalid",
      body: report.return_reasoning ?? report.return_instructions,
      tone: "border-rose-200 bg-rose-50 text-rose-900",
      icon: <LuShieldAlert className="h-4 w-4" />,
    };
  }

  return null;
}

export default function TaskReportDetailPage({
  report,
}: {
  report: PublicTaskReport;
}) {
  const thumbnailUrl =
    report.media_url ||
    (Array.isArray(report.photo_urls) ? report.photo_urls[0] : null) ||
    null;
  const reason = getReasonBlock(report);

  const handleShare = async () => {
    const shareUrl = `${window.location.origin}/reports/${report.id}`;

    if (navigator.share) {
      await navigator.share({ title: report.title, url: shareUrl });
      return;
    }

    await navigator.clipboard.writeText(shareUrl);
  };

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,_#ffffff_0%,_#f8fafc_100%)]">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-10 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link
            href="/reports"
            className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
          >
            <LuArrowLeft />
            Back to reports
          </Link>

          <button
            type="button"
            onClick={() => void handleShare()}
            className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
          >
            <LuShare2 />
            Share
          </button>
        </div>

        <article className="space-y-6 rounded-[32px] border border-gray-200 bg-white p-6 shadow-[0_28px_100px_-60px_rgba(15,23,42,0.55)]">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">
              <span
                className={`rounded-full px-3 py-1 ${getStatusTone(report)}`}
              >
                {getStatusLabel(report)}
              </span>
              {report.ward ? (
                <span className="rounded-full bg-gray-100 px-3 py-1 text-gray-700">
                  {report.ward.name}
                </span>
              ) : null}
              <span className="rounded-full bg-gray-100 px-3 py-1 text-gray-700">
                {report.category}
              </span>
            </div>

            <h1 className="text-4xl font-semibold tracking-tight text-gray-950">
              {report.title}
            </h1>

            <p className="max-w-3xl text-base leading-7 text-gray-600">
              {report.description ?? "No description was added for this report yet."}
            </p>
          </div>

          {thumbnailUrl ? (
            <div className="overflow-hidden rounded-[28px] bg-gray-100">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={thumbnailUrl}
                alt={report.title}
                className="h-auto max-h-[560px] w-full object-cover"
              />
            </div>
          ) : null}

          {reason ? (
            <div className={`rounded-[24px] border px-5 py-4 ${reason.tone}`}>
              <div className="flex items-center gap-2 text-sm font-semibold">
                {reason.icon}
                <span>{reason.title}</span>
              </div>
              {reason.body ? (
                <p className="mt-2 text-sm leading-6 opacity-90">{reason.body}</p>
              ) : null}
            </div>
          ) : null}

          <div className="grid gap-6 rounded-[28px] border border-gray-200 bg-gray-50 p-5 md:grid-cols-[1.1fr_0.9fr]">
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-4 text-sm text-gray-600">
                <span>Submitted on {formatDate(report.submitted_at)}</span>
                <span>Updated {formatTimeAgo(report.updated_at)}</span>
              </div>
              {report.address_text ? (
                <div className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm text-gray-600">
                  <LuMapPin className="h-4 w-4" />
                  {report.address_text}
                </div>
              ) : null}
            </div>

            <div className="flex flex-wrap items-center justify-start gap-3 md:justify-end">
              <div className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-4 py-2 text-sm text-gray-600">
                <LuArrowUp className="h-4 w-4 text-sky-600" />
                {report.upvote_count} upvotes
              </div>
              <div className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-4 py-2 text-sm text-gray-600">
                <LuMessageSquare className="h-4 w-4" />
                {report.comment_count} comments
              </div>
              <div className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-4 py-2 text-sm text-gray-600">
                <LuClock3 className="h-4 w-4" />
                {report.assigned_level === "municipality"
                  ? "Municipality workflow"
                  : "Ward workflow"}
              </div>
            </div>
          </div>
        </article>
      </div>
    </div>
  );
}
