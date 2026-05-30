"use client";

import React, { useState } from "react";
import { useDroppable } from "@dnd-kit/core";
import {
  useSortable,
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  MdMoreVert,
  MdChevronLeft,
  MdChevronRight,
  MdDragIndicator,
} from "react-icons/md";

import ReportCard from "./ReportCard";
import ColumnOptionsPopup from "./ColumnOptionsPopup";
import type {
  KanbanColumn as KanbanColumnType,
  ReportCard as ReportCardType,
} from "@/src/types/kanban";
import {
  getWorkflowColumnLabel,
  type WorkflowView,
} from "@/src/lib/reportWorkflow";

interface KanbanColumnProps {
  column: KanbanColumnType;
  workflowView: WorkflowView;
  /** The report id currently being dragged (null when idle). */
  activeReportId?: string | null;
  onReportClick: (report: ReportCardType) => void;
  isCollapsed?: boolean;
  onToggleCollapse?: (columnId: string) => void;
  onRenameColumn?: (columnId: string, newName: string) => Promise<void>;
  onChangeColor?: (columnId: string, newColor: string) => Promise<void>;
  onDeleteColumn?: (columnId: string) => Promise<void>;
  shouldDisableDrag?: (report: ReportCardType) => boolean;
  canSwitchColumn?: (report: ReportCardType) => boolean;
  canQuickAdvance?: (report: ReportCardType) => boolean;
  onSwitchColumn?: (report: ReportCardType) => void;
  onQuickAdvance?: (report: ReportCardType) => void;
  sortable?: boolean;
  isDragOverlay?: boolean;
}

export default function KanbanColumn({
  column,
  workflowView,
  activeReportId = null,
  onReportClick,
  isCollapsed = false,
  onToggleCollapse,
  onRenameColumn,
  onChangeColor,
  onDeleteColumn,
  shouldDisableDrag,
  canSwitchColumn,
  canQuickAdvance,
  onSwitchColumn,
  onQuickAdvance,
  sortable = true,
  isDragOverlay = false,
}: KanbanColumnProps) {
  const [isOptionsOpen, setIsOptionsOpen] = useState(false);
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const displayName = getWorkflowColumnLabel(column, workflowView);

  const { setNodeRef: setDroppableNodeRef, isOver } = useDroppable({
    id: column.id,
    data: { type: "column", column },
  });

  const {
    setNodeRef: setSortableNodeRef,
    attributes,
    listeners,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: `column-${column.id}`,
    disabled: !sortable,
    data: {
      type: "board-column",
      column,
      columnId: column.id,
    },
  });

  const reportIds = column.reports.map((r) => r.id);
  const style: React.CSSProperties = sortable
    ? {
        transform: CSS.Transform.toString(transform),
        transition,
      }
    : {};

  const handleRename = async (newName: string) => {
    if (onRenameColumn) await onRenameColumn(column.id, newName);
  };

  const handleChangeColor = async (newColor: string) => {
    if (onChangeColor) await onChangeColor(column.id, newColor);
  };

  const handleDelete = async () => {
    if (onDeleteColumn) await onDeleteColumn(column.id);
  };

  /* ---------- Collapsed ---------- */
  if (isCollapsed) {
    return (
      <div
        ref={setSortableNodeRef}
        style={style}
        className={`
          flex flex-col rounded-xl min-w-[48px] w-[48px] max-h-full items-center
          bg-gray-50 transition-colors duration-150
          ${isOver ? "bg-blue-50" : ""}
          ${isDragging && !isDragOverlay ? "opacity-40" : ""}
        `}
      >
        <div className="px-2 py-3 flex flex-col items-center gap-2 shrink-0">
          {sortable && (
            <button
              type="button"
              className="rounded p-0.5 text-gray-400 transition-colors hover:text-gray-600"
              aria-label={`Reorder ${displayName}`}
              {...attributes}
              {...listeners}
            >
              <MdDragIndicator className="text-base" />
            </button>
          )}
          <div
            className="h-2.5 w-2.5 rounded-full shrink-0"
            style={{ backgroundColor: column.color }}
          />
          <div
            className="text-xs font-medium text-gray-700 whitespace-nowrap"
            style={{ writingMode: "vertical-rl", textOrientation: "mixed" }}
          >
            {displayName}
          </div>
          <span className="text-[10px] font-medium text-gray-400">
            {column.reports.length}
          </span>
          {onToggleCollapse && (
            <button
              className="p-0.5 rounded text-gray-400 hover:text-gray-600 transition-colors cursor-pointer mt-1"
              onClick={() => onToggleCollapse(column.id)}
              title="Expand column"
            >
              <MdChevronRight className="text-base" />
            </button>
          )}
        </div>
        <div ref={setDroppableNodeRef} className="flex-1 w-full min-h-[100px]" />
      </div>
    );
  }

  /* ---------- Expanded ---------- */
  return (
    <div
      ref={setSortableNodeRef}
      style={style}
      className={`
        flex flex-col min-w-[310px] w-[310px] max-h-full rounded-xl
        bg-gray-50/80 transition-colors duration-150
        ${isOver ? "bg-blue-50/60" : ""}
        ${isDragging && !isDragOverlay ? "opacity-40" : ""}
      `}
    >
      {/* Header */}
      <div className="px-3 py-2.5 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          {sortable && (
            <button
              type="button"
              className="rounded p-1 text-gray-400 transition-colors hover:text-gray-600 cursor-grab active:cursor-grabbing"
              aria-label={`Reorder ${displayName}`}
              {...attributes}
              {...listeners}
            >
              <MdDragIndicator className="text-base" />
            </button>
          )}
          <div
            className="h-2.5 w-2.5 rounded-full shrink-0"
            style={{ backgroundColor: column.color }}
          />
          <h3 className="text-[13px] font-semibold text-gray-800">
            {displayName}
          </h3>
          <span className="text-xs text-gray-400 font-medium tabular-nums">
            {column.reports.length}
          </span>
        </div>

        <div className="flex items-center gap-0.5">
          {onToggleCollapse && (
            <button
              className="p-1 rounded text-gray-400 hover:text-gray-600 transition-colors cursor-pointer"
              onClick={() => onToggleCollapse(column.id)}
              title="Collapse column"
            >
              <MdChevronLeft className="text-base" />
            </button>
          )}
          <button
            onClick={(e) => {
              setAnchorEl(e.currentTarget);
              setIsOptionsOpen(true);
            }}
            className="p-1 rounded text-gray-400 hover:text-gray-600 transition-colors cursor-pointer"
            title="Column options"
          >
            <MdMoreVert className="text-sm" />
          </button>
        </div>
      </div>

      {isOptionsOpen && (
        <ColumnOptionsPopup
          isOpen={isOptionsOpen}
          onClose={() => setIsOptionsOpen(false)}
          anchorEl={anchorEl}
          column={column}
          onRename={handleRename}
          onChangeColor={handleChangeColor}
          onDelete={handleDelete}
        />
      )}

      {column.deadline_days && (
        <div className="px-3 pb-1.5">
          <span className="text-[10px] text-gray-400 font-medium uppercase tracking-wider">
            {column.deadline_days}d deadline
          </span>
        </div>
      )}

      {/* Cards */}
      <div
        ref={setDroppableNodeRef}
        className={`
          flex-1 overflow-y-auto px-2 pb-2 space-y-2 min-h-[80px]
          transition-colors duration-150
          ${isOver ? "bg-blue-50/40" : ""}
        `}
      >
        <SortableContext
          items={reportIds}
          strategy={verticalListSortingStrategy}
        >
          {column.reports.map((report) => (
            <ReportCard
              key={report.id}
              report={report}
              currentColumnId={column.id}
              onClick={onReportClick}
              workflowView={workflowView}
              disableDrag={shouldDisableDrag?.(report) ?? false}
              isDraggedAway={activeReportId === report.id}
              onSwitchColumn={
                canSwitchColumn?.(report) && onSwitchColumn
                  ? onSwitchColumn
                  : undefined
              }
              onQuickAdvance={
                canQuickAdvance?.(report) && onQuickAdvance
                  ? onQuickAdvance
                  : undefined
              }
            />
          ))}
        </SortableContext>

        {column.reports.length === 0 && (
          <div
            className={`
              flex items-center justify-center py-8
              rounded-lg border border-dashed transition-colors duration-150
              ${isOver ? "border-blue-300 bg-blue-50/50" : "border-gray-200"}
            `}
          >
            <p className="text-xs text-gray-400">
              {isOver ? "Drop here" : "No reports"}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
