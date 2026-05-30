"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  LuArrowUp,
  LuBuilding2,
  LuCalendar,
  LuCircleCheck,
  LuClock,
  LuExternalLink,
  LuFileWarning,
  LuImage,
  LuMapPin,
  LuMessageSquare,
  LuRefreshCcw,
  LuShieldCheck,
  LuStar,
  LuUser,
} from "react-icons/lu";

import { Modal } from "@/src/ui/Modal";
import {
  Badge,
  CategoryBadge,
  PriorityBadge,
  StatusBadge,
} from "@/src/ui/Badge";
import { Button } from "@/src/ui/Button";
import { formatTimeAgo, getDeadlineInfo } from "@/src/lib/deadline";
import { hasWorkflowAssignment } from "@/src/lib/reportAssignments";
import { getDeadlineReasonThresholdAt } from "@/src/lib/reportTimeline";
import {
  getReportDeadlineAt,
  getWorkflowHistoryEntries,
  getWorkflowDisplayStatus,
  getLatestReopenEntry,
  getWorkflowStatusLabel,
  type WorkflowView,
} from "@/src/lib/reportWorkflow";
import type { ReportCard } from "@/src/types/kanban";
import ImageLightbox from "./ImageLightbox";
import ReportLocationMap from "./ReportLocationMap";
import ReportWorkflowActionDialog, {
  type WorkflowActionConfig,
  type WorkflowActionKey,
} from "./ReportWorkflowActionDialog";
import TaskCompletionDialog from "@/src/components/reports/TaskCompletionDialog";
import type {
  DepartmentOption,
  OfficerRecord,
} from "@/src/types/officers";
import ReportDeadlineDialog from "./ReportDeadlineDialog";

// Accepted range: matches the GraphQL PriorityLevel enum and DB priority_level enum.
type AssignablePriority = "low" | "medium" | "high" | "critical";
const ASSIGNABLE_PRIORITIES: AssignablePriority[] = [
  "critical",
  "high",
  "medium",
  "low",
];

function toAssignablePriority(value: string | null | undefined): AssignablePriority {
  return ASSIGNABLE_PRIORITIES.includes(value as AssignablePriority)
    ? (value as AssignablePriority)
    : "medium";
}

interface ReportDetailModalProps {
  report: ReportCard | null;
  isOpen: boolean;
  onClose: () => void;
  workflowView: WorkflowView;
  currentUserRole: "ward" | "municipality" | "admin" | "officer" | "citizen" | null;
  assignableOfficers: OfficerRecord[];
  assignableDepartments: DepartmentOption[];
  assignmentCatalogError?: string | null;
  isAssignmentCatalogLoading?: boolean;
  isActionPending?: boolean;
  onWorkflowAction?: (
    action: WorkflowActionKey,
    input?: { reason?: string; instructions?: string; deadline_at?: string },
  ) => Promise<void>;
  onMarkSeen?: () => Promise<void>;
  onUpdateDeadline?: (input: {
    deadline_at: string;
    reason?: string;
  }) => Promise<void>;
  onAssignReport?: (input: {
    department_id?: string | null;
    officer_id?: string | null;
    priority: AssignablePriority;
  }) => Promise<void>;
  onUnassignReport?: () => Promise<void>;
  onCompleteTask?: (input: {
    afterImageUrl: string;
    description: string | null;
  }) => Promise<void>;
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-3">
      <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-400">
        {title}
      </h4>
      {children}
    </div>
  );
}

function InfoRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 py-2">
      <div className="mt-0.5 text-gray-400">{icon}</div>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-gray-500">{label}</p>
        <div className="mt-0.5 text-sm text-gray-900">{value}</div>
      </div>
    </div>
  );
}

function getActionConfig(
  action: WorkflowActionKey,
  report?: ReportCard | null,
): WorkflowActionConfig {
  switch (action) {
    case "mark_in_progress":
      if (report?.status === "completed") {
        return {
          key: action,
          title: "Re-open Task",
          description:
            "Move this completed task back into active work and record why it is being reopened.",
          submitLabel: "Re-open Task",
          requiresReason: true,
          reasonLabel: "Re-open Reason",
          reasonPlaceholder:
            "Explain why this completed task needs to be reopened...",
        };
      }

      return {
        key: action,
        title: "Mark as In Progress",
        description: "Move this report into active work immediately.",
        submitLabel: "Mark In Progress",
      };
    case "mark_completed":
      return {
        key: action,
        title: "Mark as Completed",
        description:
          "Document how the issue was resolved before closing the report.",
        submitLabel: "Mark Completed",
        requiresReason: true,
        reasonLabel: "Resolution Summary",
        reasonPlaceholder: "Describe what was done to complete this task...",
      };
    case "mark_invalid":
      return {
        key: action,
        title: "Mark as Invalid",
        description: "Explain why this report should be marked invalid.",
        submitLabel: "Mark Invalid",
        requiresReason: true,
        reasonLabel: "Invalid Reason",
        reasonPlaceholder:
          "Explain why this report is invalid, out of scope, or duplicated...",
      };
    case "escalate_to_municipality":
      return {
        key: action,
        title: "Escalate to Municipality",
        description:
          "Transfer this report to municipality with enough context for the receiving team.",
        submitLabel: "Escalate Report",
        requiresReason: true,
        reasonLabel: "Escalation Reason",
        reasonPlaceholder:
          "Explain why the ward cannot fulfil this task or why it is outside ward scope...",
      };
    case "return_to_ward":
      return {
        key: action,
        title: "Return to Ward",
        description:
          "Send the report back to the ward and include any instructions for follow-up.",
        submitLabel: "Return to Ward",
        requiresReason: true,
        reasonLabel: "Return Reason",
        reasonPlaceholder:
          "Explain why the task is being returned to the ward...",
        instructionsLabel: "Ward Instructions",
        instructionsPlaceholder:
          "Optional instructions for the ward team before they resume work...",
        deadlineLabel: "New Ward Deadline",
        deadlineRequired: true,
      };
  }
}

function getAvailableActions(
  report: ReportCard,
  currentUserRole: "ward" | "municipality" | "admin" | "officer" | "citizen" | null,
) {
  if (!currentUserRole) return [];

  if (
    (currentUserRole === "ward" || currentUserRole === "officer") &&
    report.assigned_level === "ward"
  ) {
    return [
      "mark_in_progress",
      "mark_completed",
      "mark_invalid",
      "escalate_to_municipality",
    ] as WorkflowActionKey[];
  }

  if (
    currentUserRole === "municipality" &&
    report.assigned_level === "municipality"
  ) {
    return [
      "mark_in_progress",
      "mark_completed",
      "mark_invalid",
      "return_to_ward",
    ] as WorkflowActionKey[];
  }

  if (currentUserRole === "admin") {
    return report.assigned_level === "municipality"
      ? ([
          "mark_in_progress",
          "mark_completed",
          "mark_invalid",
          "return_to_ward",
        ] as WorkflowActionKey[])
      : ([
          "mark_in_progress",
          "mark_completed",
          "mark_invalid",
          "escalate_to_municipality",
        ] as WorkflowActionKey[]);
  }

  return [];
}

function canAssignReport(
  report: ReportCard,
  currentUserRole: "ward" | "municipality" | "admin" | "officer" | "citizen" | null,
) {
  if (currentUserRole === "admin") {
    return true;
  }

  if (currentUserRole === "ward") {
    return report.assigned_level === "ward";
  }

  if (currentUserRole === "municipality") {
    return report.assigned_level === "municipality";
  }

  return false;
}

export default function ReportDetailModal({
  report,
  isOpen,
  onClose,
  workflowView,
  currentUserRole,
  assignableOfficers,
  assignableDepartments,
  assignmentCatalogError,
  isAssignmentCatalogLoading = false,
  isActionPending = false,
  onWorkflowAction,
  onMarkSeen,
  onUpdateDeadline,
  onAssignReport,
  onUnassignReport,
  onCompleteTask,
}: ReportDetailModalProps) {
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<WorkflowActionConfig | null>(
    null,
  );
  const [isDeadlineDialogOpen, setIsDeadlineDialogOpen] = useState(false);
  const [isCompletionOpen, setIsCompletionOpen] = useState(false);
  const [selectedDepartmentId, setSelectedDepartmentId] = useState(
    () => (report?.assigned_officer ? "" : report?.assigned_department?.id ?? ""),
  );
  const [selectedOfficerId, setSelectedOfficerId] = useState(
    () => report?.assigned_officer?.id ?? "",
  );
  const [selectedPriority, setSelectedPriority] = useState<
    "" | AssignablePriority
  >(() => (report ? toAssignablePriority(report.priority) : ""));

  const allPhotos = useMemo(() => {
    if (!report) return [];
    const seen = new Set<string>();
    return [
      ...(report.media_url ? [report.media_url] : []),
      ...(Array.isArray(report.photo_urls) ? report.photo_urls : []),
    ].filter((url): url is string => {
      if (!url || seen.has(url)) return false;
      seen.add(url);
      return true;
    });
  }, [report]);
  const availableOfficers = useMemo(() => {
    if (!report) {
      return [];
    }

    return assignableOfficers.filter((officer) => {
      if (report.assigned_level === "ward") {
        return officer.type === "ward_officer" && officer.wardId === report.ward_id;
      }

      return officer.type === "municipality_officer";
    });
  }, [assignableOfficers, report]);

  const submitWorkflowAction = async (
    action: WorkflowActionKey,
    input?: { reason?: string; instructions?: string },
  ) => {
    if (!onWorkflowAction) return;
    await onWorkflowAction(action, input);
    setPendingAction(null);
  };

  useEffect(() => {
    const shouldMarkSeen =
      isOpen &&
      Boolean(report) &&
      Boolean(onMarkSeen) &&
      report?.status === "incoming" &&
      (report?.assigned_level === "ward"
        ? !report?.ward_active_started_at &&
          !report?.incoming_seen_at &&
          !report?.returned_to_ward_at &&
          !report?.escalated_to_municipality
        : report?.assigned_level === "municipality"
          ? !report?.municipality_seen_at
          : false);

    if (!shouldMarkSeen || !onMarkSeen) {
      return;
    }

    void onMarkSeen();
  }, [isOpen, onMarkSeen, report]);

  useEffect(() => {
    setSelectedDepartmentId(
      report?.assigned_officer ? "" : report?.assigned_department?.id ?? "",
    );
    setSelectedOfficerId(report?.assigned_officer?.id ?? "");
    setSelectedPriority(report ? toAssignablePriority(report.priority) : "");
  }, [
    report?.assigned_department?.id,
    report?.assigned_officer?.id,
    report?.id,
    report?.priority,
  ]);

  if (!report) return null;

  const currentDeadlineAt = getReportDeadlineAt(report);
  const deadline = getDeadlineInfo(
    currentDeadlineAt instanceof Date
      ? currentDeadlineAt.toISOString()
      : currentDeadlineAt,
  );
  const displayStatus = getWorkflowDisplayStatus(report, workflowView);
  const statusLabel = getWorkflowStatusLabel(report, workflowView);
  const latestReopenEntry = getLatestReopenEntry(report.status_history);
  const historyEntries = getWorkflowHistoryEntries(report.status_history).slice().reverse();
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
  const canEditDeadline =
    Boolean(onUpdateDeadline) &&
    report.assigned_level === "ward" &&
    Boolean(report.ward_active_started_at || report.returned_to_ward_at);
  const hasAssignment = hasWorkflowAssignment(report);
  const canCompleteTask = hasAssignment;
  const actions = getAvailableActions(report, currentUserRole);
  const canManageAssignment = canAssignReport(report, currentUserRole);
  const canUnassignAssignment =
    hasAssignment &&
    canManageAssignment &&
    Boolean(onUnassignReport) &&
    !isActionPending;
  const isAssignmentDisabled =
    hasAssignment ||
    !canManageAssignment ||
    isActionPending ||
    isAssignmentCatalogLoading;
  const isCompletedTask = report.status === "completed";
  const currentDepartmentName =
    report.assigned_officer?.department.name ??
    report.assigned_department?.name ??
    null;
  const currentAssigneeName = report.assigned_officer?.name ?? null;

  const triggerAction = async (action: WorkflowActionKey) => {
    if (action === "mark_completed" && onCompleteTask) {
      setIsCompletionOpen(true);
      return;
    }

    const config = getActionConfig(action, report);

    if (config.requiresReason || config.instructionsLabel) {
      setPendingAction(config);
      return;
    }

    await submitWorkflowAction(action);
  };

  const submitDepartmentAssignment = async () => {
    if (!onAssignReport || !selectedDepartmentId || !selectedPriority) {
      return;
    }

    await onAssignReport({
      department_id: selectedDepartmentId,
      officer_id: null,
      priority: selectedPriority,
    });
  };

  const submitOfficerAssignment = async () => {
    if (!onAssignReport || !selectedOfficerId || !selectedPriority) {
      return;
    }

    await onAssignReport({
      officer_id: selectedOfficerId,
      department_id: null,
      priority: selectedPriority,
    });
  };

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        size="xl"
        header={
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge
                status={report.status}
                label={statusLabel}
                variantStatus={displayStatus}
              />
              <PriorityBadge priority={report.priority} />
              <CategoryBadge category={report.category} />
              {report.subcategory && (
                <Badge variant="outline" size="sm">
                  {report.subcategory}
                </Badge>
              )}
              {report.escalated_to_municipality && (
                <Badge variant="primary" size="sm">
                  <LuBuilding2 className="text-[11px]" />
                  {report.escalation_type === "report_not_seen"
                    ? "Report not seen"
                    : report.escalation_type === "deadline_missed"
                      ? "Deadline missed"
                      : "Escalated"}
                </Badge>
              )}
              {isAwaitingAcknowledgement && (
                <Badge variant="outline" size="sm">
                  {report.assigned_level === "municipality"
                    ? "Awaiting municipality acknowledgement"
                    : "Awaiting acknowledgement"}
                </Badge>
              )}
              {!isAwaitingAcknowledgement &&
              report.assigned_level === "ward" &&
              report.incoming_seen_at &&
              !report.ward_active_started_at ? (
                <Badge variant="default" size="sm">
                  Seen by ward
                </Badge>
              ) : null}
              {!isAwaitingAcknowledgement &&
              report.assigned_level === "municipality" &&
              report.municipality_seen_at ? (
                <Badge variant="default" size="sm">
                  Seen by municipality
                </Badge>
              ) : null}
              {report.returned_to_ward_at && report.assigned_level === "ward" && (
                <Badge variant="warning" size="sm">
                  <LuRefreshCcw className="text-[11px]" />
                  Returned to Ward
                </Badge>
              )}
              {isCurrentlyReopened && (
                <Badge variant="warning" size="sm">
                  <LuRefreshCcw className="text-[11px]" />
                  Task Reopened
                </Badge>
              )}
            </div>

            <h2 className="mt-2 text-xl font-semibold text-gray-900">
              {report.title}
            </h2>
          </div>
        }
      >
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
            {/* ── Left column: photos, description, location ── */}
            <div className="space-y-5 lg:col-span-3">
              {allPhotos.length > 0 && (
                <div className="space-y-3">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedImageIndex(0);
                      setIsLightboxOpen(true);
                    }}
                    className="relative aspect-video w-full overflow-hidden rounded-2xl bg-gray-100"
                  >
                    <img
                      src={allPhotos[0]}
                      alt={report.title}
                      className="h-full w-full object-cover"
                    />
                    {allPhotos.length > 1 && (
                      <div className="absolute bottom-3 right-3">
                        <Badge variant="default" size="sm">
                          <LuImage className="text-xs" />
                          {allPhotos.length} photos
                        </Badge>
                      </div>
                    )}
                  </button>

                  {allPhotos.length > 1 && (
                    <div className="flex gap-2 overflow-x-auto pb-1">
                      {allPhotos.map((url, index) => (
                        <button
                          key={`${url}-${index}`}
                          type="button"
                          onClick={() => {
                            setSelectedImageIndex(index);
                            setIsLightboxOpen(true);
                          }}
                          className={`h-16 w-16 shrink-0 overflow-hidden rounded-lg border-2 transition-colors ${
                            index === selectedImageIndex
                              ? "border-blue-500"
                              : "border-transparent"
                          }`}
                        >
                          <img
                            src={url}
                            alt={`Photo ${index + 1}`}
                            className="h-full w-full object-cover"
                          />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {report.description && (
                <Section title="Description">
                  <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-700">
                    {report.description}
                  </p>
                </Section>
              )}

              <Section title="Location">
                <div className="space-y-3">
                  {report.address_text && (
                    <p className="text-sm text-gray-600">{report.address_text}</p>
                  )}
                  <ReportLocationMap
                    latitude={report.location_lat}
                    longitude={report.location_lng}
                    address={report.address_text}
                  />
                </div>
              </Section>

              {(report.pathway_reason ||
                (isCurrentlyReopened && latestReopenEntry?.note) ||
                report.ward_deadline_reason ||
                report.return_reasoning ||
                report.return_instructions) && (
                <Section title="Workflow Notes">
                  <div className="space-y-3 rounded-2xl border border-gray-200 bg-gray-50 p-4">
                    {isCurrentlyReopened && latestReopenEntry?.note && (
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                          Re-open Reason
                        </p>
                        <p className="mt-1 text-sm text-gray-700">
                          {latestReopenEntry.note}
                        </p>
                      </div>
                    )}
                    {report.pathway_reason && (
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                          Escalation Reason
                        </p>
                        <p className="mt-1 text-sm text-gray-700">
                          {report.pathway_reason}
                        </p>
                      </div>
                    )}
                    {report.return_reasoning && (
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                          Return Reason
                        </p>
                        <p className="mt-1 text-sm text-gray-700">
                          {report.return_reasoning}
                        </p>
                      </div>
                    )}
                    {report.ward_deadline_reason && (
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                          Deadline Reason
                        </p>
                        <p className="mt-1 text-sm text-gray-700">
                          {report.ward_deadline_reason}
                        </p>
                      </div>
                    )}
                    {report.return_instructions && (
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                          Ward Instructions
                        </p>
                        <p className="mt-1 text-sm text-gray-700">
                          {report.return_instructions}
                        </p>
                      </div>
                    )}
                  </div>
                </Section>
              )}

              <div className="space-y-3">
                <div className="flex flex-wrap gap-3 rounded-2xl border border-gray-200 bg-white p-4">
                  <div className="inline-flex items-center gap-2 rounded-full bg-gray-100 px-3 py-2 text-sm font-medium text-gray-700">
                    {isCompletedTask ? (
                      <LuStar className="h-4 w-4 text-amber-500" />
                    ) : (
                      <LuArrowUp className="h-4 w-4 text-sky-600" />
                    )}
                    <span>
                      {isCompletedTask
                        ? `${report.report_post?.rating_count ?? 0} reviews`
                        : `${report.upvote_count} upvotes`}
                    </span>
                  </div>
                  <div className="inline-flex items-center gap-2 rounded-full bg-gray-100 px-3 py-2 text-sm font-medium text-gray-700">
                    <LuMessageSquare className="h-4 w-4 text-gray-500" />
                    <span>{report.comment_count} comments</span>
                  </div>
                  {isCompletedTask && report.report_post ? (
                    <div className="inline-flex items-center gap-2 rounded-full bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800">
                      <LuStar className="h-4 w-4" />
                      <span>{report.report_post.rating_average.toFixed(1)} average</span>
                    </div>
                  ) : null}
                </div>
                {!report.is_public && (
                  <div className="pt-1">
                    <Badge variant="outline" size="sm">
                      Private
                    </Badge>
                  </div>
                )}
              </div>
            </div>

            {/* ── Right column: Assignment (top), then info ── */}
            <div className="space-y-4 lg:col-span-2 min-w-0">
              {/* ── 1. Assignment — primary action ── */}
              <div className="rounded-xl border border-blue-200 bg-blue-50/40 p-4">
                <div className="flex items-center justify-between gap-2 mb-3">
                  <h4 className="text-sm font-semibold text-gray-900">
                    Assignment
                  </h4>
                  <Badge variant="outline" size="sm">
                    {report.assigned_level === "ward" ? "Ward" : "Municipality"}
                  </Badge>
                </div>

                <div className="space-y-3">
                  {hasAssignment ? (
                    <div className="space-y-3 rounded-xl border border-blue-200 bg-white p-3">
                      <div>
                        <p className="text-xs font-medium text-gray-500">
                          Current Assignment
                        </p>
                        <p className="mt-1 text-sm font-semibold text-gray-900">
                          {currentAssigneeName ?? currentDepartmentName ?? "Assigned"}
                        </p>
                        {currentAssigneeName && currentDepartmentName ? (
                          <p className="mt-1 text-xs text-gray-500">
                            Department: {currentDepartmentName}
                          </p>
                        ) : null}
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        {currentAssigneeName ? (
                          <Badge variant="outline" size="sm">
                            Officer assigned
                          </Badge>
                        ) : null}
                        {currentDepartmentName ? (
                          <Badge variant="outline" size="sm">
                            {currentDepartmentName}
                          </Badge>
                        ) : null}
                      </div>
                      <p className="text-xs text-gray-500">
                        Unassign this task before choosing a different owner.
                      </p>
                      {canUnassignAssignment ? (
                        <div className="flex justify-start">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => void onUnassignReport?.()}
                          >
                            Unassign Task
                          </Button>
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <>
                      {/* Priority — mandatory before assignment */}
                      <div>
                        <label className="mb-1 block text-xs font-medium text-gray-500">
                          Priority <span className="text-red-500">*</span>
                        </label>
                        <select
                          value={selectedPriority}
                          onChange={(event) =>
                            setSelectedPriority(
                              event.target.value as typeof selectedPriority,
                            )
                          }
                          disabled={isAssignmentDisabled}
                          className="h-9 w-full rounded-lg border border-gray-300 bg-white px-2.5 text-sm text-gray-900 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 disabled:bg-gray-50"
                        >
                          <option value="">Select priority</option>
                          {ASSIGNABLE_PRIORITIES.map((priority) => (
                            <option key={priority} value={priority}>
                              {priority.charAt(0).toUpperCase() + priority.slice(1)}
                            </option>
                          ))}
                        </select>
                        {!selectedPriority && !isAssignmentDisabled && (
                          <p className="mt-1 text-xs text-gray-400">
                            Set a priority to enable assignment.
                          </p>
                        )}
                      </div>

                      {/* Department */}
                      <div>
                        <label className="mb-1 block text-xs font-medium text-gray-500">
                          Department
                        </label>
                        <div className="flex gap-1.5">
                          <select
                            value={selectedDepartmentId}
                            onChange={(event) => {
                              setSelectedDepartmentId(event.target.value);
                              if (event.target.value) setSelectedOfficerId("");
                            }}
                            disabled={isAssignmentDisabled}
                            className="h-9 flex-1 min-w-0 rounded-lg border border-gray-300 bg-white px-2.5 text-sm text-gray-900 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 disabled:bg-gray-50 truncate"
                          >
                            <option value="">Select department</option>
                            {assignableDepartments.map((department) => (
                              <option key={department.id} value={department.id}>
                                {department.name}
                              </option>
                            ))}
                          </select>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={
                              !canManageAssignment ||
                              !selectedDepartmentId ||
                              !selectedPriority ||
                              isActionPending ||
                              isAssignmentCatalogLoading
                            }
                            onClick={() => void submitDepartmentAssignment()}
                          >
                            Assign
                          </Button>
                        </div>
                      </div>

                      {/* Officer */}
                      <div>
                        <label className="mb-1 block text-xs font-medium text-gray-500">
                          Officer
                        </label>
                        <div className="flex gap-1.5">
                          <select
                            value={selectedOfficerId}
                            onChange={(event) => {
                              setSelectedOfficerId(event.target.value);
                              if (event.target.value) setSelectedDepartmentId("");
                            }}
                            disabled={isAssignmentDisabled}
                            className="h-9 flex-1 min-w-0 rounded-lg border border-gray-300 bg-white px-2.5 text-sm text-gray-900 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 disabled:bg-gray-50 truncate"
                          >
                            <option value="">Select officer</option>
                            {availableOfficers.map((officer) => (
                              <option key={officer.id} value={officer.id}>
                                {officer.firstName} {officer.lastName} ({officer.department.name})
                              </option>
                            ))}
                          </select>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={
                              !canManageAssignment ||
                              !selectedOfficerId ||
                              !selectedPriority ||
                              isActionPending ||
                              isAssignmentCatalogLoading
                            }
                            onClick={() => void submitOfficerAssignment()}
                          >
                            Assign
                          </Button>
                        </div>
                        {availableOfficers.length === 0 && (
                          <p className="mt-1 text-xs text-gray-400">
                            No officers available for this scope.
                          </p>
                        )}
                      </div>
                    </>
                  )}

                  {isAssignmentCatalogLoading && (
                    <p className="text-xs text-gray-400">Loading...</p>
                  )}
                  {assignmentCatalogError && (
                    <p className="text-xs text-red-600">{assignmentCatalogError}</p>
                  )}
                  {!canManageAssignment && (
                    <p className="text-xs text-gray-400">
                      Only the active workflow owner can update or clear assignment.
                    </p>
                  )}
                </div>
              </div>

              {/* ── 2. Workflow actions — secondary, compact ── */}
              {actions.length > 0 && onWorkflowAction && (
                <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
                  <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">
                    Actions
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {actions.map((action) => {
                      const config = getActionConfig(action, report);
                      const icon =
                        action === "escalate_to_municipality" ? (
                          <LuBuilding2 />
                        ) : action === "return_to_ward" ? (
                          <LuRefreshCcw />
                        ) : action === "mark_completed" ? (
                          <LuCircleCheck />
                        ) : action === "mark_invalid" ? (
                          <LuFileWarning />
                        ) : (
                          <LuShieldCheck />
                        );

                      return (
                        <Button
                          key={action}
                          variant={action === "mark_invalid" ? "danger" : "outline"}
                          size="sm"
                          disabled={
                            isActionPending ||
                            (action === "mark_completed" && !canCompleteTask)
                          }
                          leftIcon={icon}
                          onClick={() => void triggerAction(action)}
                        >
                          {config.submitLabel}
                        </Button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* ── 3. Deadline ── */}
              {deadline.status !== "none" && (
                <div
                  className={`rounded-lg border px-3 py-2 ${
                    deadline.status === "overdue"
                      ? "border-red-200 bg-red-50"
                      : deadline.status === "urgent"
                        ? "border-orange-200 bg-orange-50"
                        : deadline.status === "warning"
                          ? "border-yellow-200 bg-yellow-50"
                          : "border-gray-200 bg-gray-50"
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <LuClock className={`text-sm ${deadline.color}`} />
                      <span className={`text-sm font-medium ${deadline.color}`}>
                        {deadline.label}
                      </span>
                    </div>
                    {canEditDeadline && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={isActionPending}
                        onClick={() => setIsDeadlineDialogOpen(true)}
                      >
                        Update deadline
                      </Button>
                    )}
                  </div>
                  {currentDeadlineAt && (
                    <p className="mt-2 text-xs text-gray-500">
                      Current deadline:{" "}
                      {new Date(
                        currentDeadlineAt instanceof Date
                          ? currentDeadlineAt
                          : currentDeadlineAt,
                      ).toLocaleString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </p>
                  )}
                </div>
              )}

              {/* ── 4. Details — compact info rows ── */}
              <div className="divide-y divide-gray-100 rounded-xl border border-gray-200 bg-gray-50 px-3 py-1">
                <InfoRow
                  icon={<LuCalendar className="text-sm" />}
                  label="Submitted"
                  value={
                    <span className="truncate">
                      {new Date(report.submitted_at).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                      <span className="ml-1 text-xs text-gray-400">
                        ({formatTimeAgo(report.submitted_at)})
                      </span>
                    </span>
                  }
                />

                {report.assigned_level === "ward" &&
                report.incoming_ack_deadline_at &&
                !report.ward_active_started_at ? (
                  <InfoRow
                    icon={<LuClock className="text-sm" />}
                    label="Ack deadline"
                    value={new Date(report.incoming_ack_deadline_at).toLocaleString(
                      "en-US",
                      {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      },
                    )}
                  />
                ) : null}

                {report.assigned_level === "municipality" &&
                report.status === "incoming" &&
                report.municipality_received_at &&
                !report.municipality_seen_at ? (
                  <InfoRow
                    icon={<LuClock className="text-sm" />}
                    label="Municipality ack deadline"
                    value={new Date(
                      new Date(report.municipality_received_at).getTime() +
                        24 * 60 * 60 * 1000,
                    ).toLocaleString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  />
                ) : null}

                {report.incoming_seen_at && (
                  <InfoRow
                    icon={<LuShieldCheck className="text-sm" />}
                    label="Seen by ward"
                    value={new Date(report.incoming_seen_at).toLocaleString(
                      "en-US",
                      {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      },
                    )}
                  />
                )}

                {report.municipality_seen_at && (
                  <InfoRow
                    icon={<LuShieldCheck className="text-sm" />}
                    label="Seen by municipality"
                    value={new Date(report.municipality_seen_at).toLocaleString(
                      "en-US",
                      {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      },
                    )}
                  />
                )}

                {report.assigned_department && (
                  <InfoRow
                    icon={<LuBuilding2 className="text-sm" />}
                    label="Department"
                    value={
                      <span className="truncate">{report.assigned_department.name}</span>
                    }
                  />
                )}

                {report.assigned_officer && (
                  <InfoRow
                    icon={<LuUser className="text-sm" />}
                    label="Officer"
                    value={
                      <div className="min-w-0">
                        <p className="font-medium truncate">{report.assigned_officer.name}</p>
                        <p className="text-xs text-gray-400 truncate">
                          {report.assigned_officer.department.name}
                        </p>
                      </div>
                    }
                  />
                )}

                {report.address_text && (
                  <InfoRow
                    icon={<LuMapPin className="text-sm" />}
                    label="Address"
                    value={
                      <span className="truncate block">{report.address_text}</span>
                    }
                  />
                )}

                {report.estimated_completion_date && (
                  <InfoRow
                    icon={<LuClock className="text-sm" />}
                    label="Est. Completion"
                    value={new Date(
                      report.estimated_completion_date,
                    ).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  />
                )}

                {report.escalated_at && (
                  <InfoRow
                    icon={<LuBuilding2 className="text-sm" />}
                    label="Escalated"
                    value={new Date(report.escalated_at).toLocaleDateString(
                      "en-US",
                      { month: "short", day: "numeric", year: "numeric" },
                    )}
                  />
                )}

                {report.returned_to_ward_at && (
                  <InfoRow
                    icon={<LuRefreshCcw className="text-sm" />}
                    label="Returned"
                    value={new Date(report.returned_to_ward_at).toLocaleDateString(
                      "en-US",
                      { month: "short", day: "numeric", year: "numeric" },
                    )}
                  />
                )}

                {report.location_lat !== null && report.location_lng !== null && (
                  <InfoRow
                    icon={<LuExternalLink className="text-sm" />}
                    label="Coordinates"
                    value={
                      <a
                        href={`https://www.google.com/maps?q=${report.location_lat},${report.location_lng}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-blue-600 hover:underline"
                      >
                        {report.location_lat.toFixed(6)},{" "}
                        {report.location_lng.toFixed(6)}
                      </a>
                    }
                  />
                )}
              </div>

              {historyEntries.length > 0 && (
                <div className="rounded-xl border border-gray-200 bg-white p-4">
                  <p className="text-xs font-medium uppercase tracking-wider text-gray-400">
                    Workflow history
                  </p>
                  <div className="mt-3 space-y-3">
                    {historyEntries.slice(0, 8).map((entry, index) => (
                      <div
                        key={`${entry.at}-${entry.type}-${index}`}
                        className="border-b border-gray-100 pb-3 last:border-b-0 last:pb-0"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-medium text-gray-900">
                            {entry.type.replace(/_/g, " ")}
                          </p>
                          <span className="text-xs text-gray-400">
                            {new Date(entry.at).toLocaleString("en-US", {
                              month: "short",
                              day: "numeric",
                              hour: "numeric",
                              minute: "2-digit",
                            })}
                          </span>
                        </div>
                        {entry.note ? (
                          <p className="mt-1 text-sm text-gray-600">{entry.note}</p>
                        ) : null}
                        {entry.deadline_at ? (
                          <p className="mt-1 text-xs text-gray-500">
                            Deadline:{" "}
                            {new Date(entry.deadline_at).toLocaleString("en-US", {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                              hour: "numeric",
                              minute: "2-digit",
                            })}
                          </p>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </Modal>

      <ImageLightbox
        images={allPhotos}
        selectedIndex={selectedImageIndex}
        isOpen={isLightboxOpen}
        onClose={() => setIsLightboxOpen(false)}
        onChange={setSelectedImageIndex}
      />

      <ReportWorkflowActionDialog
        key={`${report.id}-${pendingAction?.key ?? "idle"}-${Boolean(pendingAction)}`}
        action={pendingAction}
        isOpen={Boolean(pendingAction)}
        isSubmitting={isActionPending}
        onClose={() => setPendingAction(null)}
        onSubmit={async (input) => {
          if (!pendingAction) return;
          await submitWorkflowAction(pendingAction.key, input);
        }}
      />

      <ReportDeadlineDialog
        key={`${report.id}-${currentDeadlineAt instanceof Date ? currentDeadlineAt.toISOString() : currentDeadlineAt ?? "none"}-${isDeadlineDialogOpen}`}
        isOpen={isDeadlineDialogOpen}
        isSubmitting={isActionPending}
        initialDeadlineAt={
          typeof currentDeadlineAt === "string"
            ? currentDeadlineAt
            : currentDeadlineAt?.toISOString() ?? null
        }
        reasonThresholdAt={
          report.ward_active_started_at || report.returned_to_ward_at
            ? getDeadlineReasonThresholdAt(
                new Date(report.ward_active_started_at || report.returned_to_ward_at!),
              ).toISOString()
            : null
        }
        onClose={() => setIsDeadlineDialogOpen(false)}
        onSubmit={async (input) => {
          if (!onUpdateDeadline) {
            return;
          }

          await onUpdateDeadline(input);
          setIsDeadlineDialogOpen(false);
        }}
      />

      <TaskCompletionDialog
        isOpen={isCompletionOpen}
        onClose={() => setIsCompletionOpen(false)}
        title="Mark as completed"
        descriptionText="Upload the completion image that will be published on the public report feed. The description is optional."
        submitLabel="Complete task"
        initialDescription={report.resolution_description}
        taskTitle={report.title}
        onSubmit={async (input) => {
          if (!onCompleteTask) {
            return;
          }

          await onCompleteTask(input);
          setIsCompletionOpen(false);
        }}
      />
    </>
  );
}
