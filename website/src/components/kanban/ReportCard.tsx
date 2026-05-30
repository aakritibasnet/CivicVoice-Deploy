/* eslint-disable @next/next/no-img-element */
"use client";

import React from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  LuMessageSquare,
  LuArrowUp,
  LuBuilding2,
  LuMapPin,
  LuClock,
  LuStar,
  LuUser,
} from "react-icons/lu";

import {
  PriorityBadge,
  CategoryBadge,
  Badge,
} from "@/src/ui/Badge";
import { getDeadlineInfo, formatTimeAgo } from "@/src/lib/deadline";
import {
  getReportDeadlineAt,
  getLatestReopenEntry,
  type WorkflowView,
} from "@/src/lib/reportWorkflow";
import type { ReportCard as ReportCardType } from "@/src/types/kanban";

interface ReportCardProps {
  report: ReportCardType;
  currentColumnId?: string;
  onClick: (report: ReportCardType) => void;
  workflowView: WorkflowView;
  disableDrag?: boolean;
  /** True when this card is the one currently being dragged (source ghost). */
  isDraggedAway?: boolean;
  onSwitchColumn?: (report: ReportCardType) => void;
  onQuickAdvance?: (report: ReportCardType) => void;
  sortable?: boolean;
  isDragOverlay?: boolean;
}

/* ------------------------------------------------------------------ */
/*  Shared card body                                                   */
/* ------------------------------------------------------------------ */

interface ReportCardBodyProps {
  report: ReportCardType;
  onClick: (report: ReportCardType) => void;
  onSwitchColumn?: (report: ReportCardType) => void;
  onQuickAdvance?: (report: ReportCardType) => void;
  containerRef?: (node: HTMLDivElement | null) => void;
  className?: string;
  style?: React.CSSProperties;
  draggableProps?: React.HTMLAttributes<HTMLDivElement>;
}

function ReportCardBody({
  report,
  onClick,
  onSwitchColumn,
  onQuickAdvance,
  containerRef,
  className,
  style,
  draggableProps,
}: ReportCardBodyProps) {
  const currentDeadlineAt = getReportDeadlineAt(report);
  const deadline = getDeadlineInfo(
    currentDeadlineAt instanceof Date
      ? currentDeadlineAt.toISOString()
      : currentDeadlineAt,
  );
  const latestReopenEntry = getLatestReopenEntry(report.status_history);
  const isCurrentlyReopened =
    Boolean(latestReopenEntry) &&
    (report.status === "incoming" || report.status === "in_progress");
  const isAwaitingAcknowledgement =
    report.status === "incoming" &&
    (report.assigned_level === "ward"
      ? !report.ward_active_started_at &&
        !report.incoming_seen_at &&
        !report.returned_to_ward_at &&
        !report.escalated_to_municipality
      : report.assigned_level === "municipality"
        ? !report.municipality_seen_at
        : false);

  const thumbnailUrl =
    report.media_url ||
    (Array.isArray(report.photo_urls) && report.photo_urls.length > 0
      ? report.photo_urls[0]
      : null);
  const isCompletedTask = report.status === "completed";
  const primaryCount = isCompletedTask
    ? report.report_post?.rating_count ?? 0
    : report.upvote_count;

  return (
    <div
      ref={containerRef}
      style={style}
      onClick={() => onClick(report)}
      className={`
        ${deadline.status !== "none" ? deadline.borderColor : "border-gray-200"}
        ${deadline.bgColor}
        ${className ?? ""}
      `}
      {...draggableProps}
    >
      {/* Thumbnail */}
      {thumbnailUrl && (
        <div className="relative h-28 w-full overflow-hidden rounded-t-lg">
          <img
            src={thumbnailUrl}
            alt={report.title}
            className="h-full w-full object-cover"
            loading="lazy"
          />
          <div className="absolute top-2 right-2">
            <PriorityBadge priority={report.priority} />
          </div>
        </div>
      )}

      {/* Content */}
      <div className="p-3 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <h4 className="text-sm font-medium text-gray-900 line-clamp-2 leading-snug">
            {report.title}
          </h4>
          {!thumbnailUrl && <PriorityBadge priority={report.priority} />}
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          <CategoryBadge category={report.category} />
          {isCurrentlyReopened ? (
            <Badge variant="warning" size="sm">
              Reopened
            </Badge>
          ) : isAwaitingAcknowledgement ? (
            <Badge variant="outline" size="sm">
              Unseen
            </Badge>
          ) : null}
        </div>

        {report.address_text && (
          <div className="flex items-start gap-1.5 text-xs text-gray-500">
            <LuMapPin className="text-xs mt-0.5 flex-shrink-0" />
            <span className="line-clamp-1">{report.address_text}</span>
          </div>
        )}

        {/* Meta footer — a single divider groups actions, counts, and owner */}
        <div className="space-y-2 border-t border-gray-100 pt-2">
          {(onSwitchColumn || onQuickAdvance) && (
            <div className="flex items-center justify-end gap-1.5">
              {onSwitchColumn && (
                <button
                  type="button"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSwitchColumn(report);
                  }}
                  className="rounded-md border border-gray-200 px-2 py-0.5 text-[11px] font-medium text-gray-600 transition-colors hover:bg-gray-50"
                >
                  Switch Column
                </button>
              )}
              {onQuickAdvance && (
                <button
                  type="button"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    onQuickAdvance(report);
                  }}
                  className="rounded-md border border-gray-200 px-2 py-0.5 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50"
                  aria-label="Move to next column"
                >
                  &gt;
                </button>
              )}
            </div>
          )}

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 text-xs text-gray-400">
              <span className="flex items-center gap-1">
                {isCompletedTask ? (
                  <LuStar className="text-xs" />
                ) : (
                  <LuArrowUp className="text-xs" />
                )}
                {primaryCount}
              </span>
              <span className="flex items-center gap-1">
                <LuMessageSquare className="text-xs" />
                {report.comment_count}
              </span>
            </div>

            <div className="flex items-center gap-1.5">
              {deadline.status !== "none" ? (
                <span
                  className={`text-[10px] font-medium ${deadline.color} flex items-center gap-0.5`}
                >
                  <LuClock className="text-[10px]" />
                  {deadline.label}
                </span>
              ) : (
                <span className="text-[10px] text-gray-400">
                  {formatTimeAgo(report.submitted_at)}
                </span>
              )}
            </div>
          </div>

          {report.assigned_officer && (
            <div className="flex items-center gap-1.5 text-xs text-gray-500">
              <div className="h-4 w-4 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                <LuUser className="text-[9px]" />
              </div>
              <span className="truncate">{report.assigned_officer.name}</span>
            </div>
          )}

          {!report.assigned_officer && report.assigned_department && (
            <div className="flex items-center gap-1.5 text-xs text-gray-500">
              <div className="h-4 w-4 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                <LuBuilding2 className="text-[9px]" />
              </div>
              <span className="truncate">{report.assigned_department.name}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Sortable wrapper                                                   */
/* ------------------------------------------------------------------ */

function SortableReportCard({
  report,
  currentColumnId,
  onClick,
  disableDrag = false,
  isDraggedAway = false,
  onSwitchColumn,
  onQuickAdvance,
}: ReportCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: report.id,
    disabled: disableDrag,
    data: {
      type: "report",
      report,
      columnId: currentColumnId ?? report.kanban_column_id,
    },
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  // When this card is being dragged, hide it from the source column
  // so there's no "duplicate" visible behind the overlay.
  const isHidden = isDragging || isDraggedAway;

  return (
    <ReportCardBody
      report={report}
      onClick={onClick}
      onSwitchColumn={onSwitchColumn}
      onQuickAdvance={onQuickAdvance}
      containerRef={setNodeRef}
      style={style}
      className={`
        bg-white rounded-lg border cursor-grab active:cursor-grabbing
        transition-opacity duration-150
        ${disableDrag ? "cursor-default" : ""}
        ${isHidden ? "opacity-0" : "opacity-100"}
      `}
      draggableProps={{
        ...attributes,
        ...(disableDrag ? {} : listeners),
      }}
    />
  );
}

/* ------------------------------------------------------------------ */
/*  Static (overlay / non-sortable)                                    */
/* ------------------------------------------------------------------ */

function StaticReportCard(props: ReportCardProps) {
  return (
    <ReportCardBody
      report={props.report}
      onClick={props.onClick}
      onSwitchColumn={props.onSwitchColumn}
      onQuickAdvance={props.onQuickAdvance}
      className={`
        bg-white rounded-lg border border-gray-200
        ${props.isDragOverlay ? "shadow-lg ring-1 ring-black/5" : ""}
      `}
    />
  );
}

/* ------------------------------------------------------------------ */
/*  Export                                                             */
/* ------------------------------------------------------------------ */

export default function ReportCard(props: ReportCardProps) {
  if (props.sortable === false) {
    return <StaticReportCard {...props} />;
  }
  return <SortableReportCard {...props} />;
}
