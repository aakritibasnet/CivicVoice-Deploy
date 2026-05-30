"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  horizontalListSortingStrategy,
  SortableContext,
} from "@dnd-kit/sortable";
import { useMutation, useQuery } from "@apollo/client/react";
import { IoAlertCircleOutline } from "react-icons/io5";
import { LuKanban, LuPlus, LuRefreshCw } from "react-icons/lu";

import AddColumnModal from "./Addcolumnmodal";
import KanbanColumn from "./KanbanColumn";
import ReportCard from "./ReportCard";
import ReportDetailModal from "./ReportDetailModal";
import ResolutionModal from "./ResolutionModal";
import type { ResolutionData } from "./ResolutionModal";
import TaskCompletionDialog from "@/src/components/reports/TaskCompletionDialog";
import { Button } from "@/src/ui/Button";
import { Modal } from "@/src/ui/Modal";
import {
  APPLY_REPORT_WORKFLOW_ACTION,
  ASSIGN_REPORT,
  DELETE_KANBAN_COLUMN,
  GET_KANBAN_BOARD,
  GET_KANBAN_PREFERENCES,
  MARK_REPORT_SEEN,
  MOVE_REPORT,
  MOVE_REPORT_WITH_RESOLUTION,
  TOGGLE_COLUMN_COLLAPSE,
  UNASSIGN_REPORT,
  UPDATE_KANBAN_PREFERENCES,
  UPDATE_REPORT_DEADLINE,
  UPDATE_KANBAN_COLUMN,
} from "@/src/graphql/operations/kanban";
import { COMPLETE_TASK } from "@/src/graphql/operations/report-posts";
import { useOfficersDirectory } from "@/src/features/officers/useOfficersDirectory";
import type { CompleteTaskData } from "@/src/types/report-posts";
import {
  getNextWorkflowStatus,
  type WorkflowStatus,
  type WorkflowView,
} from "@/src/lib/reportWorkflow";
import { hasWorkflowAssignment } from "@/src/lib/reportAssignments";
import { useAuthStore } from "@/src/store/auth-store";
import { useKanbanStore } from "@/src/store/kanbanStore";
import type {
  KanbanBoardData,
  KanbanColumn as KanbanColumnType,
  ReportCard as ReportCardType,
} from "@/src/types/kanban";

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function requiresResolution(column: KanbanColumnType): boolean {
  if (isCompletionColumn(column)) return false;
  if (column.is_terminal) return true;

  const status = column.mapped_status?.toLowerCase();
  if (status === "completed" || status === "invalid" || status === "returned") {
    return true;
  }

  const name = column.name.toLowerCase();
  return (
    name.includes("transfer") ||
    name.includes("municipality") ||
    name.includes("escalat") ||
    name.includes("returned")
  );
}

function isCompletionColumn(column: KanbanColumnType): boolean {
  const status = column.mapped_status?.toLowerCase();
  const name = column.name.toLowerCase();

  return (
    status === "completed" ||
    name.includes("completed") ||
    name.includes("resolved") ||
    name.includes("done")
  );
}

function requiresReopenReason(
  report: ReportCardType,
  targetColumn: KanbanColumnType,
): boolean {
  const targetStatus = targetColumn.mapped_status?.toLowerCase();
  return (
    report.status === "completed" &&
    (targetStatus === "incoming" || targetStatus === "in_progress")
  );
}

function canCompleteReport(report: ReportCardType) {
  return hasWorkflowAssignment(report);
}

function getWorkflowActionForColumn(
  targetColumn: KanbanColumnType,
):
  | "mark_in_progress"
  | "mark_completed"
  | "mark_invalid"
  | "escalate_to_municipality"
  | "return_to_ward"
  | null {
  const status = targetColumn.mapped_status?.toLowerCase();

  if (status) {
    switch (status) {
      case "in_progress":
        return "mark_in_progress";
      case "completed":
        return "mark_completed";
      case "invalid":
        return "mark_invalid";
      case "escalated":
        return "escalate_to_municipality";
      case "returned":
        return "return_to_ward";
      default:
        break;
    }
  }

  const name = targetColumn.name.toLowerCase();
  if (name.includes("in progress") || name.includes("in-progress"))
    return "mark_in_progress";
  if (
    name.includes("completed") ||
    name.includes("done") ||
    name.includes("resolved")
  )
    return "mark_completed";
  if (name.includes("invalid") || name.includes("rejected"))
    return "mark_invalid";
  if (name.includes("escalat") || name.includes("municipality"))
    return "escalate_to_municipality";
  if (name.includes("returned") || name.includes("return to ward"))
    return "return_to_ward";

  return null;
}

/* ------------------------------------------------------------------ */
/*  Skeleton / Error / Empty                                           */
/* ------------------------------------------------------------------ */

function KanbanSkeleton() {
  return (
    <div className="flex h-full gap-4 overflow-x-auto pb-4">
      {[1, 2, 3, 4].map((column) => (
        <div
          key={column}
          className="min-w-[300px] w-[300px] space-y-3 rounded-xl bg-gray-50/80 p-3"
        >
          <div className="flex items-center gap-2.5">
            <div className="h-2.5 w-2.5 animate-pulse rounded-full bg-gray-200" />
            <div className="h-4 w-24 animate-pulse rounded bg-gray-200" />
          </div>
          {[1, 2, 3].map((card) => (
            <div
              key={card}
              className="space-y-2.5 rounded-lg border border-gray-100 bg-white p-3"
            >
              <div className="h-4 w-3/4 animate-pulse rounded bg-gray-100" />
              <div className="h-3 w-1/2 animate-pulse rounded bg-gray-100" />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function KanbanError({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="flex flex-1 items-center justify-center">
      <div className="max-w-md space-y-4 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-red-50 text-red-500">
          <IoAlertCircleOutline className="text-2xl" />
        </div>
        <h3 className="text-lg font-semibold text-gray-900">
          Failed to load board
        </h3>
        <p className="text-sm text-gray-500">{message}</p>
        <Button variant="outline" onClick={() => onRetry()} leftIcon={<LuRefreshCw />}>
          Retry
        </Button>
      </div>
    </div>
  );
}

function KanbanEmpty({ onAddColumn }: { onAddColumn: () => void }) {
  return (
    <div className="flex flex-1 items-center justify-center">
      <div className="max-w-md space-y-4 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-gray-50 text-gray-400">
          <LuKanban className="text-2xl" />
        </div>
        <h3 className="text-lg font-semibold text-gray-900">
          No columns configured
        </h3>
        <p className="text-sm text-gray-500">
          Get started by adding your first column.
        </p>
        <Button variant="outline" onClick={onAddColumn} leftIcon={<LuPlus />}>
          Add Column
        </Button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface PendingMove {
  reportId: string;
  report: ReportCardType;
  sourceColumnId: string;
  targetColumnId: string;
  sourceColumn: KanbanColumnType;
  targetColumn: KanbanColumnType;
  workflowAction?:
    | "mark_in_progress"
    | "mark_completed"
    | "mark_invalid"
    | "escalate_to_municipality"
    | "return_to_ward"
  | null;
}

interface KanbanPreferencesData {
  kanbanUserPreferences: {
    collapsed_columns: string[];
    column_order: string[] | null;
  } | null;
}

interface ToggleColumnCollapseData {
  toggleColumnCollapse: {
    collapsed_columns: string[];
    column_order: string[] | null;
  };
}

interface UpdateKanbanPreferencesData {
  updateKanbanPreferences: {
    collapsed_columns: string[];
    column_order: string[] | null;
  };
}

interface UpdateKanbanColumnData {
  updateKanbanColumn: KanbanColumnType;
}

interface DeleteKanbanColumnData {
  deleteKanbanColumn: boolean;
}

interface MoveReportData {
  moveReport: ReportCardType;
}

interface MoveReportWithResolutionData {
  moveReportWithResolution: ReportCardType;
}

interface ApplyReportWorkflowActionData {
  applyReportWorkflowAction: ReportCardType;
}

interface AssignReportData {
  assignReport: ReportCardType;
}

interface UnassignReportData {
  unassignReport: ReportCardType;
}

interface MarkReportSeenData {
  markReportSeen: ReportCardType;
}

interface UpdateReportDeadlineData {
  updateReportDeadline: ReportCardType;
}

function getWorkflowView(role?: string | null): WorkflowView {
  if (role === "municipality") return "municipality";
  if (role === "admin") return "admin";
  return "ward";
}

/* ------------------------------------------------------------------ */
/*  KanbanBoard                                                        */
/* ------------------------------------------------------------------ */

export default function KanbanBoard() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const user = useAuthStore((state) => state.user);
  const workflowView = getWorkflowView(user?.role);
  const officerViewer = useMemo(
    () => ({
      role: user?.role ?? "ward",
      wardId: user?.ward_id ?? null,
      wardName: user?.ward?.name ?? null,
    }),
    [user?.role, user?.ward_id, user?.ward?.name],
  );

  const [activeReport, setActiveReport] = useState<ReportCardType | null>(null);
  const [activeColumn, setActiveColumn] = useState<KanbanColumnType | null>(
    null,
  );
  const [selectedReport, setSelectedReport] = useState<ReportCardType | null>(
    null,
  );
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isAddColumnOpen, setIsAddColumnOpen] = useState(false);
  const [isResolutionOpen, setIsResolutionOpen] = useState(false);
  const [isCompletionOpen, setIsCompletionOpen] = useState(false);
  const [pendingMove, setPendingMove] = useState<PendingMove | null>(null);
  const [assignmentRequiredReport, setAssignmentRequiredReport] =
    useState<ReportCardType | null>(null);

  // Optimistic local column state — prevents the snap-back flicker
  const [optimisticColumns, setOptimisticColumns] = useState<
    KanbanColumnType[] | null
  >(null);

  const {
    isColumnCollapsed,
    setCollapsedColumns,
    setColumnOrder,
    columnOrder,
  } = useKanbanStore();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  /* ---- Data ---- */

  const { data, loading, error, refetch } = useQuery<KanbanBoardData>(
    GET_KANBAN_BOARD,
    { pollInterval: 30000, fetchPolicy: "cache-and-network" },
  );

  const { data: preferencesData } = useQuery<KanbanPreferencesData>(
    GET_KANBAN_PREFERENCES,
    {
      fetchPolicy: "cache-and-network",
    },
  );

  const [toggleCollapseMutation] =
    useMutation<ToggleColumnCollapseData>(TOGGLE_COLUMN_COLLAPSE);
  const [updateKanbanPreferencesMutation] =
    useMutation<UpdateKanbanPreferencesData>(UPDATE_KANBAN_PREFERENCES);
  const [updateColumnMutation] =
    useMutation<UpdateKanbanColumnData>(UPDATE_KANBAN_COLUMN);
  const [deleteColumnMutation] =
    useMutation<DeleteKanbanColumnData>(DELETE_KANBAN_COLUMN);
  const [moveReportMutation] = useMutation<MoveReportData>(MOVE_REPORT);
  const [moveReportWithResolution] =
    useMutation<MoveReportWithResolutionData>(MOVE_REPORT_WITH_RESOLUTION);
  const [completeTaskMutation] = useMutation<CompleteTaskData>(COMPLETE_TASK);
  const [assignReportMutation, { loading: isAssigningReport }] = useMutation<
    AssignReportData
  >(ASSIGN_REPORT);
  const [unassignReportMutation, { loading: isUnassigningReport }] =
    useMutation<UnassignReportData>(UNASSIGN_REPORT);
  const [applyReportWorkflowAction, { loading: isWorkflowActionPending }] =
    useMutation<ApplyReportWorkflowActionData>(APPLY_REPORT_WORKFLOW_ACTION);
  const [markReportSeenMutation, { loading: isMarkingReportSeen }] =
    useMutation<MarkReportSeenData>(MARK_REPORT_SEEN);
  const [updateReportDeadlineMutation, { loading: isUpdatingReportDeadline }] =
    useMutation<UpdateReportDeadlineData>(UPDATE_REPORT_DEADLINE);
  const {
    officers: assignmentOfficers,
    departments: assignmentDepartments,
    loading: isAssignmentCatalogLoading,
    error: assignmentCatalogError,
  } = useOfficersDirectory(officerViewer);

  useEffect(() => {
    if (preferencesData?.kanbanUserPreferences?.collapsed_columns) {
      setCollapsedColumns(
        preferencesData.kanbanUserPreferences.collapsed_columns,
      );
    }
    if (preferencesData?.kanbanUserPreferences?.column_order) {
      setColumnOrder(preferencesData.kanbanUserPreferences.column_order);
    }
  }, [preferencesData, setCollapsedColumns, setColumnOrder]);

  const serverColumns = useMemo(() => data?.kanbanBoard ?? [], [data]);

  const columns = useMemo(() => {
    const sourceColumns = optimisticColumns ?? serverColumns;
    if (!columnOrder.length) {
      return sourceColumns;
    }

    const columnMap = new Map(sourceColumns.map((column) => [column.id, column]));
    const orderedColumns: KanbanColumnType[] = [];

    columnOrder.forEach((columnId) => {
      const column = columnMap.get(columnId);
      if (column) {
        orderedColumns.push(column);
        columnMap.delete(columnId);
      }
    });

    sourceColumns.forEach((column) => {
      if (columnMap.has(column.id)) {
        orderedColumns.push(column);
      }
    });

    return orderedColumns;
  }, [columnOrder, optimisticColumns, serverColumns]);

  const allReports = useMemo(
    () => columns.flatMap((col) => col.reports),
    [columns],
  );

  const currentSelectedReport = useMemo(() => {
    if (!selectedReport) return null;

    const boardReport =
      allReports.find((report) => report.id === selectedReport.id) ?? null;

    if (!boardReport) {
      return selectedReport;
    }

    const selectedTimestamp = Date.parse(selectedReport.updated_at);
    const boardTimestamp = Date.parse(boardReport.updated_at);

    if (
      Number.isFinite(selectedTimestamp) &&
      Number.isFinite(boardTimestamp) &&
      selectedTimestamp >= boardTimestamp
    ) {
      return selectedReport;
    }

    return boardReport;
  }, [allReports, selectedReport]);

  const findColumn = useCallback(
    (id: string) => columns.find((c) => c.id === id) ?? null,
    [columns],
  );
  const requestedReportId = searchParams.get("report");

  const updateReportParam = useCallback(
    (reportId: string | null) => {
      const nextParams = new URLSearchParams(searchParams.toString());

      if (reportId) {
        nextParams.set("report", reportId);
      } else {
        nextParams.delete("report");
      }

      const nextQuery = nextParams.toString();
      router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, {
        scroll: false,
      });
    },
    [pathname, router, searchParams],
  );

  /* ---- Helpers ---- */

  const syncSelectedReport = useCallback((next?: ReportCardType | null) => {
    if (!next) return;
    setSelectedReport((cur) => (cur?.id === next.id ? next : cur));
  }, []);

  const syncReportIntoColumns = useCallback(
    (next?: ReportCardType | null) => {
      if (!next) {
        return;
      }

      setOptimisticColumns((current) => {
        const base = current ?? serverColumns;
        let didReplace = false;

        const updatedColumns = base.map((column) => {
          const reportIndex = column.reports.findIndex(
            (report) => report.id === next.id,
          );

          if (reportIndex === -1) {
            return column;
          }

          didReplace = true;

          return {
            ...column,
            reports: column.reports.map((report) =>
              report.id === next.id ? next : report,
            ),
          };
        });

        return didReplace ? updatedColumns : current;
      });
    },
    [serverColumns],
  );

  const persistColumnOrder = useCallback(
    async (nextColumnOrder: string[]) => {
      const collapsedColumns = Array.from(
        useKanbanStore.getState().collapsedColumns,
      );
      const result = await updateKanbanPreferencesMutation({
        variables: {
          input: {
            collapsed_columns: collapsedColumns,
            column_order: nextColumnOrder,
          },
        },
      });
      const updatedPreferences = result.data?.updateKanbanPreferences;
      if (updatedPreferences) {
        setCollapsedColumns(updatedPreferences.collapsed_columns);
        setColumnOrder(updatedPreferences.column_order ?? nextColumnOrder);
      }
    },
    [
      setCollapsedColumns,
      setColumnOrder,
      updateKanbanPreferencesMutation,
    ],
  );

  useEffect(() => {
    if (!requestedReportId) {
      return;
    }

    const reportFromUrl =
      allReports.find((report) => report.id === requestedReportId) ?? null;

    if (!reportFromUrl) {
      return;
    }

    setSelectedReport((current) =>
      current?.id === reportFromUrl.id ? current : reportFromUrl,
    );
    setIsDetailOpen(true);
  }, [allReports, requestedReportId]);

  /** Move card locally so it appears instantly in the target column. */
  const applyOptimisticMove = useCallback(
    (reportId: string, sourceColumnId: string, targetColumnId: string) => {
      const base = optimisticColumns ?? serverColumns;
      const report = base
        .flatMap((c) => c.reports)
        .find((r) => r.id === reportId);
      if (!report) return;

      setOptimisticColumns(
        base.map((col) => {
          if (col.id === sourceColumnId) {
            return {
              ...col,
              reports: col.reports.filter((r) => r.id !== reportId),
            };
          }
          if (col.id === targetColumnId) {
            return {
              ...col,
              reports: [
                ...col.reports,
                { ...report, kanban_column_id: targetColumnId },
              ],
            };
          }
          return col;
        }),
      );
    },
    [optimisticColumns, serverColumns],
  );

  const runWorkflowAction = useCallback(
    async (
      report: ReportCardType,
      action:
        | "mark_in_progress"
        | "mark_completed"
        | "mark_invalid"
        | "escalate_to_municipality"
        | "return_to_ward",
      input?: { reason?: string; instructions?: string; deadline_at?: string },
    ) => {
      const result = await applyReportWorkflowAction({
        variables: { reportId: report.id, action, input: input ?? null },
      });
      const updated = result.data?.applyReportWorkflowAction ?? null;
      syncSelectedReport(updated);
      await refetch();
      setOptimisticColumns(null);
      return updated;
    },
    [applyReportWorkflowAction, refetch, syncSelectedReport],
  );

  const executeMoveReport = useCallback(
    async (
      reportId: string,
      report: ReportCardType,
      targetColumnId: string,
    ) => {
      const result = await moveReportMutation({
        variables: { reportId, columnId: targetColumnId },
      });
      syncSelectedReport(result.data?.moveReport ?? report);
      await refetch();
      setOptimisticColumns(null);
    },
    [moveReportMutation, refetch, syncSelectedReport],
  );

  const handleAssignReport = useCallback(
    async (
      report: ReportCardType,
      input: {
        department_id?: string | null;
        officer_id?: string | null;
        priority: "low" | "medium" | "high" | "critical";
      },
    ) => {
      const result = await assignReportMutation({
        variables: {
          reportId: report.id,
          input,
        },
      });
      const updated = result.data?.assignReport ?? null;
      syncSelectedReport(updated);
      syncReportIntoColumns(updated);
      await refetch();
      setOptimisticColumns(null);
      return updated;
    },
    [assignReportMutation, refetch, syncReportIntoColumns, syncSelectedReport],
  );

  const handleUnassignReport = useCallback(
    async (report: ReportCardType) => {
      const result = await unassignReportMutation({
        variables: { reportId: report.id },
      });
      const updated = result.data?.unassignReport ?? null;
      syncSelectedReport(updated);
      syncReportIntoColumns(updated);
      await refetch();
      setOptimisticColumns(null);
      return updated;
    },
    [
      refetch,
      syncReportIntoColumns,
      syncSelectedReport,
      unassignReportMutation,
    ],
  );

  /* ---- DnD handlers ---- */

  const handleDragStart = useCallback((event: DragStartEvent) => {
    if (event.active.data.current?.type === "board-column") {
      const column = event.active.data.current?.column as
        | KanbanColumnType
        | undefined;
      if (column) {
        setActiveColumn(column);
      }
      return;
    }

    const report = event.active.data.current?.report as
      | ReportCardType
      | undefined;
    if (report) setActiveReport(report);
  }, []);

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event;
      setActiveReport(null);
      setActiveColumn(null);

      if (!over) return;

      if (active.data.current?.type === "board-column") {
        const activeColumnId =
          (active.data.current?.columnId as string | undefined) ??
          String(active.id).replace(/^column-/, "");
        const overColumnId =
          (over.data.current?.columnId as string | undefined) ??
          (over.data.current?.type === "column"
            ? String(over.id)
            : String(over.id).replace(/^column-/, ""));

        if (!activeColumnId || !overColumnId || activeColumnId === overColumnId) {
          return;
        }

        const currentOrder = columns.map((column) => column.id);
        const oldIndex = currentOrder.indexOf(activeColumnId);
        const newIndex = currentOrder.indexOf(overColumnId);

        if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) {
          return;
        }

        const nextOrder = arrayMove(currentOrder, oldIndex, newIndex);
        setColumnOrder(nextOrder);

        try {
          await persistColumnOrder(nextOrder);
        } catch (error) {
          console.error("Failed to persist column order:", error);
          setColumnOrder(currentOrder);
        }
        return;
      }

      const sourceColumnId = active.data.current?.columnId as
        | string
        | undefined;
      const report = active.data.current?.report as ReportCardType | undefined;
      if (!sourceColumnId || !report) return;

      let targetColumnId: string | undefined;
      if (over.data.current?.type === "column") {
        targetColumnId = over.id as string;
      } else if (over.data.current?.columnId) {
        targetColumnId = over.data.current.columnId as string;
      } else {
        const col = findColumn(over.id as string);
        if (col) targetColumnId = col.id;
      }

      if (!targetColumnId || sourceColumnId === targetColumnId) return;

      const sourceColumn = findColumn(sourceColumnId);
      const targetColumn = findColumn(targetColumnId);
      if (!sourceColumn || !targetColumn) return;

      const workflowAction = getWorkflowActionForColumn(targetColumn);

      if (workflowAction === "return_to_ward") {
        setSelectedReport(report);
        setIsDetailOpen(true);
        return;
      }

      if (isCompletionColumn(targetColumn)) {
        if (!canCompleteReport(report)) {
          setAssignmentRequiredReport(report);
          return;
        }

        // Optimistic: move card immediately in local state
        applyOptimisticMove(report.id, sourceColumnId, targetColumnId);
        setPendingMove({
          reportId: report.id,
          report: { ...report },
          sourceColumnId,
          targetColumnId,
          sourceColumn,
          targetColumn,
          workflowAction,
        });
        setIsCompletionOpen(true);
        return;
      }

      // Optimistic: move card immediately in local state
      applyOptimisticMove(report.id, sourceColumnId, targetColumnId);

      if (requiresReopenReason(report, targetColumn)) {
        setPendingMove({
          reportId: report.id,
          report: { ...report },
          sourceColumnId,
          targetColumnId,
          sourceColumn,
          targetColumn,
          workflowAction,
        });
        setIsResolutionOpen(true);
        return;
      }

      if (requiresResolution(targetColumn)) {
        setPendingMove({
          reportId: report.id,
          report: { ...report },
          sourceColumnId,
          targetColumnId,
          sourceColumn,
          targetColumn,
          workflowAction,
        });
        setIsResolutionOpen(true);
        return;
      }

      if (workflowAction) {
        try {
          await runWorkflowAction(report, workflowAction);
        } catch (err) {
          console.error("Workflow action failed during drag:", err);
          setOptimisticColumns(null);
          await executeMoveReport(report.id, report, targetColumnId);
        }
        return;
      }

      await executeMoveReport(report.id, report, targetColumnId);
    },
    [
      applyOptimisticMove,
      columns,
      executeMoveReport,
      findColumn,
      persistColumnOrder,
      runWorkflowAction,
      setColumnOrder,
    ],
  );

  const handleDragCancel = useCallback(() => {
    setActiveReport(null);
    setActiveColumn(null);
  }, []);

  /* ---- Resolution ---- */

  const handleResolutionSubmit = useCallback(
    async (resolutionData: ResolutionData) => {
      if (!pendingMove) return;

      if (pendingMove.workflowAction) {
        try {
          await runWorkflowAction(
            pendingMove.report,
            pendingMove.workflowAction,
            {
              reason: resolutionData.reason,
              instructions: undefined,
            },
          );
          setPendingMove(null);
          return;
        } catch (err) {
          console.error("Workflow action with resolution failed:", err);
        }
      }

      const result = await moveReportWithResolution({
        variables: {
          reportId: pendingMove.reportId,
          columnId: pendingMove.targetColumnId,
          resolution: {
            reason: resolutionData.reason,
            proof_image_urls: [],
          },
        },
      });
      syncSelectedReport(
        result.data?.moveReportWithResolution ?? pendingMove.report,
      );
      setPendingMove(null);
      await refetch();
      setOptimisticColumns(null);
    },
    [
      moveReportWithResolution,
      pendingMove,
      refetch,
      runWorkflowAction,
      syncSelectedReport,
    ],
  );

  const handleResolutionClose = useCallback(() => {
    setIsResolutionOpen(false);
    setOptimisticColumns(null); // revert on cancel
    setPendingMove(null);
  }, []);

  const handleCompletionSubmit = useCallback(
    async (input: { afterImageUrl: string; description: string | null }) => {
      if (!pendingMove) return;

      await completeTaskMutation({
        variables: {
          taskId: pendingMove.reportId,
          afterImage: input.afterImageUrl,
          description: input.description,
        },
      });

      setPendingMove(null);
      await refetch();
      setOptimisticColumns(null);
    },
    [completeTaskMutation, pendingMove, refetch],
  );

  const handleCompletionClose = useCallback(() => {
    setIsCompletionOpen(false);
    setOptimisticColumns(null);
    setPendingMove(null);
  }, []);

  /* ---- Report detail ---- */

  const handleReportClick = useCallback((report: ReportCardType) => {
    setSelectedReport(report);
    setIsDetailOpen(true);
    updateReportParam(report.id);
  }, [updateReportParam]);

  const handleOpenAssignmentDetails = useCallback(() => {
    if (!assignmentRequiredReport) {
      return;
    }

    setSelectedReport(assignmentRequiredReport);
    setIsDetailOpen(true);
    setAssignmentRequiredReport(null);
  }, [assignmentRequiredReport]);

  const handleCloseDetail = useCallback(() => {
    setIsDetailOpen(false);
    updateReportParam(null);
    setTimeout(() => setSelectedReport(null), 200);
  }, [updateReportParam]);

  const handleMarkReportSeen = useCallback(async () => {
    if (!currentSelectedReport) {
      return;
    }

    const result = await markReportSeenMutation({
      variables: { reportId: currentSelectedReport.id },
    });
    const updated = result.data?.markReportSeen ?? null;
    syncSelectedReport(updated);
    syncReportIntoColumns(updated);
    await refetch();
  }, [
    currentSelectedReport,
    markReportSeenMutation,
    refetch,
    syncReportIntoColumns,
    syncSelectedReport,
  ]);

  const handleUpdateReportDeadline = useCallback(
    async (input: { deadline_at: string; reason?: string }) => {
      if (!currentSelectedReport) {
        return;
      }

      const result = await updateReportDeadlineMutation({
        variables: {
          reportId: currentSelectedReport.id,
          input,
        },
      });
      const updated = result.data?.updateReportDeadline ?? null;
      syncSelectedReport(updated);
      syncReportIntoColumns(updated);
      await refetch();
    },
    [
      currentSelectedReport,
      refetch,
      syncReportIntoColumns,
      syncSelectedReport,
      updateReportDeadlineMutation,
    ],
  );

  /* ---- Column actions ---- */

  const handleToggleCollapse = useCallback(
    async (columnId: string) => {
      try {
        useKanbanStore.getState().toggleColumnCollapse(columnId);
        const result = await toggleCollapseMutation({ variables: { columnId } });
        const updatedPreferences = result.data?.toggleColumnCollapse;
        if (updatedPreferences) {
          setCollapsedColumns(updatedPreferences.collapsed_columns);
          if (updatedPreferences.column_order) {
            setColumnOrder(updatedPreferences.column_order);
          }
        }
      } catch {
        useKanbanStore.getState().toggleColumnCollapse(columnId);
      }
    },
    [setCollapsedColumns, setColumnOrder, toggleCollapseMutation],
  );

  const handleRenameColumn = useCallback(
    async (columnId: string, newName: string) => {
      await updateColumnMutation({
        variables: { id: columnId, input: { name: newName } },
      });
      await refetch();
    },
    [refetch, updateColumnMutation],
  );

  const handleChangeColor = useCallback(
    async (columnId: string, newColor: string) => {
      await updateColumnMutation({
        variables: { id: columnId, input: { color: newColor } },
      });
      await refetch();
    },
    [refetch, updateColumnMutation],
  );

  const handleDeleteColumn = useCallback(
    async (columnId: string) => {
      await deleteColumnMutation({ variables: { id: columnId } });
      await refetch();
    },
    [deleteColumnMutation, refetch],
  );

  const canQuickAdvance = useCallback(
    (report: ReportCardType) =>
      workflowView === "ward" &&
      report.assigned_level === "ward" &&
      report.status === "incoming",
    [workflowView],
  );

  const handleQuickAdvance = useCallback(
    async (report: ReportCardType) => {
      const nextStatus = getNextWorkflowStatus(report.status, workflowView);
      if (!nextStatus) return;
      const actionByStatus: Partial<
        Record<
          WorkflowStatus,
          | "mark_in_progress"
          | "mark_completed"
          | "mark_invalid"
          | "escalate_to_municipality"
          | "return_to_ward"
        >
      > = { in_progress: "mark_in_progress" };
      const action = actionByStatus[nextStatus];
      if (!action) return;
      await runWorkflowAction(report, action);
    },
    [runWorkflowAction, workflowView],
  );

  const shouldDisableDrag = useCallback(
    (report: ReportCardType) => {
      if (user?.role === "ward") return report.assigned_level !== "ward";
      if (user?.role === "municipality")
        return report.assigned_level !== "municipality";
      return false;
    },
    [user?.role],
  );

  /* ---- Render ---- */

  if (loading && !data) return <KanbanSkeleton />;
  if (error) return <KanbanError message={error.message} onRetry={refetch} />;

  if (!columns.length) {
    return (
      <>
        <KanbanEmpty onAddColumn={() => setIsAddColumnOpen(true)} />
        <AddColumnModal
          isOpen={isAddColumnOpen}
          onClose={() => setIsAddColumnOpen(false)}
          existingColumnCount={0}
        />
      </>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="mb-3 flex shrink-0 items-center justify-between">
        <div />
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsAddColumnOpen(true)}
            leftIcon={<LuPlus />}
            className="border-gray-200 text-gray-600 hover:bg-gray-50"
          >
            Add Column
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            leftIcon={<LuRefreshCw />}
            className="border-none text-gray-500 hover:bg-gray-50"
          >
            <span className="sr-only">Refresh board</span>
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-x-auto overflow-y-hidden">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragEnd={(event) => void handleDragEnd(event)}
          onDragCancel={handleDragCancel}
        >
          <SortableContext
            items={columns.map((column) => `column-${column.id}`)}
            strategy={horizontalListSortingStrategy}
          >
            <div className="flex h-full gap-4 pb-4">
              {columns.map((column) => (
                <KanbanColumn
                  key={column.id}
                  column={column}
                  workflowView={workflowView}
                  activeReportId={activeReport?.id ?? null}
                  onReportClick={handleReportClick}
                  isCollapsed={isColumnCollapsed(column.id)}
                  onToggleCollapse={handleToggleCollapse}
                  onRenameColumn={handleRenameColumn}
                  onChangeColor={handleChangeColor}
                  onDeleteColumn={handleDeleteColumn}
                  shouldDisableDrag={shouldDisableDrag}
                  canSwitchColumn={canQuickAdvance}
                  canQuickAdvance={canQuickAdvance}
                  onSwitchColumn={(report) => void handleQuickAdvance(report)}
                  onQuickAdvance={(report) => void handleQuickAdvance(report)}
                />
              ))}
            </div>
          </SortableContext>

          {/* dropAnimation={null} prevents the overlay from animating
              back to origin — the card is already optimistically placed */}
          <DragOverlay dropAnimation={null}>
            {activeReport ? (
              <div className="w-[300px]">
                <ReportCard
                  report={activeReport}
                  onClick={() => {}}
                  workflowView={workflowView}
                  sortable={false}
                  isDragOverlay
                />
              </div>
            ) : activeColumn ? (
              <KanbanColumn
                column={activeColumn}
                workflowView={workflowView}
                activeReportId={null}
                onReportClick={() => {}}
                isCollapsed={isColumnCollapsed(activeColumn.id)}
                sortable={false}
                isDragOverlay
              />
            ) : null}
          </DragOverlay>
        </DndContext>
      </div>

      <ReportDetailModal
        key={`${currentSelectedReport?.id ?? "none"}-${currentSelectedReport?.assigned_department?.id ?? "no-dept"}-${currentSelectedReport?.assigned_officer?.id ?? "no-officer"}-${isDetailOpen}`}
        report={currentSelectedReport}
        isOpen={isDetailOpen}
        onClose={handleCloseDetail}
        workflowView={workflowView}
        currentUserRole={user?.role ?? null}
        assignableOfficers={assignmentOfficers}
        assignableDepartments={assignmentDepartments}
        assignmentCatalogError={assignmentCatalogError}
        isAssignmentCatalogLoading={isAssignmentCatalogLoading}
        isActionPending={
          isWorkflowActionPending ||
          isAssigningReport ||
          isUnassigningReport ||
          isUpdatingReportDeadline ||
          isMarkingReportSeen
        }
        onWorkflowAction={
          currentSelectedReport
            ? async (action, input) => {
                await runWorkflowAction(currentSelectedReport, action, input);
              }
            : undefined
        }
        onMarkSeen={currentSelectedReport ? handleMarkReportSeen : undefined}
        onUpdateDeadline={
          currentSelectedReport ? handleUpdateReportDeadline : undefined
        }
        onAssignReport={
          currentSelectedReport
            ? async (input) => {
                await handleAssignReport(currentSelectedReport, input);
              }
            : undefined
        }
        onUnassignReport={
          currentSelectedReport
            ? async () => {
                await handleUnassignReport(currentSelectedReport);
              }
            : undefined
        }
        onCompleteTask={
          currentSelectedReport
            ? async (input) => {
                await completeTaskMutation({
                  variables: {
                    taskId: currentSelectedReport.id,
                    afterImage: input.afterImageUrl,
                    description: input.description,
                  },
                });
                await refetch();
              }
            : undefined
        }
      />

      <ResolutionModal
        isOpen={isResolutionOpen}
        onClose={handleResolutionClose}
        onSubmit={handleResolutionSubmit}
        report={pendingMove?.report ?? null}
        sourceColumn={pendingMove?.sourceColumn ?? null}
        targetColumn={pendingMove?.targetColumn ?? null}
      />

      <TaskCompletionDialog
        isOpen={isCompletionOpen}
        onClose={handleCompletionClose}
        onSubmit={handleCompletionSubmit}
        title="Complete task"
        descriptionText="Upload the completion image and optionally add a public description. This will auto-generate the public report post."
        submitLabel="Publish completion"
        initialDescription={pendingMove?.report.description ?? null}
        taskTitle={pendingMove?.report.title ?? null}
      />

      <Modal
        isOpen={Boolean(assignmentRequiredReport)}
        onClose={() => setAssignmentRequiredReport(null)}
        title="Assignment Required"
        description="A task needs an owner before it can be completed."
        size="md"
      >
        <div className="space-y-5">
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
                <IoAlertCircleOutline className="text-xl" />
              </div>
              <div>
                <p className="text-sm font-semibold text-amber-900">
                  Assign a department or officer before marking this task as completed.
                </p>
                <p className="mt-1 text-sm text-amber-800">
                  Open the task details, assign it, and then complete it from the same workflow.
                </p>
              </div>
            </div>
          </div>

          {assignmentRequiredReport ? (
            <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                Task
              </p>
              <p className="mt-1 text-sm font-medium text-gray-900">
                {assignmentRequiredReport.title}
              </p>
              <p className="mt-1 text-xs text-gray-500">
                {assignmentRequiredReport.assigned_level === "ward"
                  ? "Ward workflow"
                  : "Municipality workflow"}
              </p>
            </div>
          ) : null}

          <div className="flex items-center justify-end gap-3 border-t border-gray-100 pt-2">
            <Button
              variant="outline"
              onClick={() => setAssignmentRequiredReport(null)}
            >
              Close
            </Button>
            <Button onClick={handleOpenAssignmentDetails}>
              Open Task Details
            </Button>
          </div>
        </div>
      </Modal>

      <AddColumnModal
        isOpen={isAddColumnOpen}
        onClose={() => setIsAddColumnOpen(false)}
        existingColumnCount={columns.length}
      />
    </div>
  );
}
