"use client";

import Link from "next/link";
import {
  LuMessageSquare,
  LuShare2,
  LuClock,
  LuTriangleAlert,
  LuMapPin,
  LuUser,
  LuPencil,
} from "react-icons/lu";
import { CiCircleCheck } from "react-icons/ci";
import type { ReportPost } from "@/src/types/report-posts";
import BeforeAfterSplit from "./BeforeAfterSplit";
import BookmarkButton from "./BookmarkButton";
import StarRatingInput from "./StarRatingInput";

interface ReportCardProps {
  post: ReportPost;
  onRate: (rating: number) => void;
  onToggleBookmark: () => void;
  onShare: () => void;
}

function formatDate(value: string) {
  const date = new Date(value);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  const formatted = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);

  if (diffDays === 0) return `Today`;
  if (diffDays === 1) return `Yesterday`;
  if (diffDays < 7) return `${diffDays} days ago`;
  return formatted;
}

function formatFullDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatStatusLabel(value: string | null) {
  if (!value) {
    return null;
  }

  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function getDaysToComplete(incoming: string, completed: string) {
  const start = new Date(incoming);
  const end = new Date(completed);
  const diffMs = end.getTime() - start.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));

  if (diffHours < 1) return "Under an hour";
  if (diffHours < 24) return `${diffHours}h`;
  if (diffDays === 1) return "1 day";
  return `${diffDays} days`;
}

const priorityConfig: Record<string, { label: string; color: string }> = {
  low: { label: "Low", color: "text-gray-500 bg-gray-50" },
  medium: { label: "Medium", color: "text-amber-600 bg-amber-50" },
  high: { label: "High", color: "text-red-600 bg-red-50" },
  urgent: { label: "Urgent", color: "text-red-700 bg-red-100" },
};

export default function ReportCard({
  post,
  onRate,
  onToggleBookmark,
  onShare,
}: ReportCardProps) {
  const incomingDate = post.task?.submitted_at ?? post.created_at;
  const priority = priorityConfig[post.priority] ?? priorityConfig.medium;

  return (
    <article className="w-full overflow-hidden rounded-2xl bg-white">
      {/* Image section — full width */}
      <BeforeAfterSplit
        beforeImageUrl={post.before_image_url}
        afterImageUrl={post.after_image_url}
        title={post.title}
      />

      {/* Content */}
      <div className="space-y-4 px-5 py-5 sm:px-6">
        {/* Tags row */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600">
            <LuMapPin className="h-3 w-3" />
            {post.ward_name}
          </span>
          <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600">
            {post.category}
          </span>
          <span
            className={`rounded-full px-2.5 py-1 text-xs font-medium ${priority.color}`}
          >
            {priority.label}
          </span>
          {post.edited_count > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-gray-50 px-2.5 py-1 text-xs font-medium text-gray-400">
              <LuPencil className="h-3 w-3" />
              Edited {post.edited_count}x
            </span>
          )}
          {post.is_reopened && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700">
              <LuTriangleAlert className="h-3 w-3" />
              Reopened
            </span>
          )}
        </div>

        {/* Title + description */}
        <div className="space-y-1.5">
          <Link href={`/reports/${post.id}`} className="block">
            <h2 className="text-lg font-semibold text-gray-900 transition-colors hover:text-gray-600">
              {post.title}
            </h2>
          </Link>
          {post.description && (
            <p className="text-sm leading-relaxed text-gray-500">
              {post.description}
            </p>
          )}
        </div>

        {/* Timeline: Incoming → Completed */}
        {post.is_reopened && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <p className="font-medium">
              Task reopened
              {post.reopened_by_name ? ` by ${post.reopened_by_name}` : ""}.
            </p>
            {post.reopened_reason ? (
              <p className="mt-1 text-amber-800">{post.reopened_reason}</p>
            ) : null}
            {post.reopened_status && (
              <p className="mt-1 text-xs uppercase tracking-wide text-amber-700">
                Current status: {formatStatusLabel(post.reopened_status)}
              </p>
            )}
          </div>
        )}

        <div className="flex flex-col gap-2 rounded-xl bg-gray-50 px-4 py-3 sm:flex-row sm:items-center sm:gap-6">
          <div className="flex items-center gap-2 text-sm">
            <LuClock className="h-3.5 w-3.5 text-gray-400" />
            <span className="text-gray-400">Reported</span>
            <span
              className="font-medium text-gray-700"
              title={formatFullDate(incomingDate)}
            >
              {formatDate(incomingDate)}
            </span>
          </div>

          <span className="hidden text-gray-300 sm:inline">→</span>

          <div className="flex items-center gap-2 text-sm">
            <CiCircleCheck className="h-3.5 w-3.5 text-emerald-500" />
            <span className="text-gray-400">Completed</span>
            <span
              className="font-medium text-gray-700"
              title={formatFullDate(post.completed_at)}
            >
              {formatDate(post.completed_at)}
            </span>
          </div>

          <span className="ml-auto text-xs text-gray-400">
            Resolved in {getDaysToComplete(incomingDate, post.completed_at)}
          </span>
        </div>

        {/* Completed by */}
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <LuUser className="h-3.5 w-3.5" />
          <span>
            Completed by{" "}
            <span className="font-medium text-gray-700">
              {post.completed_by_name}
            </span>
          </span>
          {post.completed_by_role && (
            <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[11px] font-medium uppercase tracking-wide text-gray-400">
              {post.completed_by_role.replace("_", " ")}
            </span>
          )}
        </div>

        {/* Actions */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 pt-4">
          <StarRatingInput
            value={post.viewer_rating}
            average={post.rating_average}
            count={post.rating_count}
            disabled={!post.viewer_can_rate}
            onRate={onRate}
          />

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={onShare}
              className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700"
            >
              <LuShare2 className="h-3.5 w-3.5" />
              Share
            </button>

            <Link
              href={`/reports/${post.id}`}
              className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700"
            >
              <LuMessageSquare className="h-3.5 w-3.5" />
              {post.comment_count > 0 ? `${post.comment_count}` : "Discuss"}
            </Link>

            <BookmarkButton
              active={post.is_bookmarked}
              count={post.bookmark_count}
              disabled={!post.viewer_can_bookmark}
              onToggle={onToggleBookmark}
            />
          </div>
        </div>
      </div>
    </article>
  );
}
