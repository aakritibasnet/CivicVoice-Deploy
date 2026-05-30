"use client";

import React, { useState } from "react";
import {
  MdEdit,
  MdDelete,
  MdPalette,
  MdCheck,
  MdClose,
  MdWarning,
} from "react-icons/md";
import AnchoredPopup from "@/src/ui/AnchoredPopup";
import ColorPicker from "@/src/ui/ColorPicker";
import type { KanbanColumn } from "@/src/types/kanban";

interface ColumnOptionsPopupProps {
  isOpen: boolean;
  onClose: () => void;
  anchorEl: HTMLElement | null;
  column: KanbanColumn;
  onRename: (newName: string) => Promise<void>;
  onChangeColor: (newColor: string) => Promise<void>;
  onDelete: () => Promise<void>;
}

type ViewMode = "menu" | "rename" | "color" | "delete-confirm";

export default function ColumnOptionsPopup({
  isOpen,
  onClose,
  anchorEl,
  column,
  onRename,
  onChangeColor,
  onDelete,
}: ColumnOptionsPopupProps) {
  const [viewMode, setViewMode] = useState<ViewMode>("menu");
  const [editName, setEditName] = useState(column.name);
  const [selectedColor, setSelectedColor] = useState(column.color);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClose = () => {
    setViewMode("menu");
    setEditName(column.name);
    setSelectedColor(column.color);
    setError(null);
    setIsProcessing(false);
    onClose();
  };

  const handleRename = async () => {
    if (!editName.trim()) {
      setError("Column name cannot be empty");
      return;
    }

    if (editName === column.name) {
      setViewMode("menu");
      return;
    }

    setIsProcessing(true);
    setError(null);

    try {
      await onRename(editName.trim());
      handleClose();
    } catch (err: any) {
      setError(err.message || "Failed to rename column");
      setIsProcessing(false);
    }
  };

  const handleColorChange = async () => {
    if (selectedColor === column.color) {
      setViewMode("menu");
      return;
    }

    setIsProcessing(true);
    setError(null);

    try {
      await onChangeColor(selectedColor);
      handleClose();
    } catch (err: any) {
      setError(err.message || "Failed to change color");
      setIsProcessing(false);
    }
  };

  const handleDelete = async () => {
    setIsProcessing(true);
    setError(null);

    try {
      await onDelete();
      handleClose();
    } catch (err: any) {
      setError(err.message || "Failed to delete column");
      setIsProcessing(false);
    }
  };

  const renderContent = () => {
    switch (viewMode) {
      case "rename":
        return (
          <div className="p-3 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-900">
                Rename Column
              </h3>
              <button
                onClick={() => setViewMode("menu")}
                className="p-1 hover:bg-gray-100 rounded"
                disabled={isProcessing}
              >
                <MdClose className="text-gray-400" />
              </button>
            </div>

            <input
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleRename();
                if (e.key === "Escape") setViewMode("menu");
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              placeholder="Column name"
              autoFocus
              disabled={isProcessing}
            />

            {error && (
              <div className="text-xs text-red-600 flex items-center gap-1">
                <MdWarning className="text-sm" />
                {error}
              </div>
            )}

            <div className="flex gap-2">
              <button
                onClick={handleRename}
                disabled={isProcessing || !editName.trim()}
                className="flex-1 px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium flex items-center justify-center gap-1"
              >
                <MdCheck className="text-lg" />
                {isProcessing ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        );

      case "color":
        return (
          <div className="p-3 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-900">
                Change Color
              </h3>
              <button
                onClick={() => setViewMode("menu")}
                className="p-1 hover:bg-gray-100 rounded"
                disabled={isProcessing}
              >
                <MdClose className="text-gray-400" />
              </button>
            </div>

            <ColorPicker value={selectedColor} onChange={setSelectedColor} />

            {error && (
              <div className="text-xs text-red-600 flex items-center gap-1">
                <MdWarning className="text-sm" />
                {error}
              </div>
            )}

            <div className="flex gap-2">
              <button
                onClick={handleColorChange}
                disabled={isProcessing}
                className="flex-1 px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium flex items-center justify-center gap-1"
              >
                <MdCheck className="text-lg" />
                {isProcessing ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        );

      case "delete-confirm":
        return (
          <div className="p-3 space-y-3">
            <div className="flex items-center gap-2 text-red-600">
              <MdWarning className="text-xl" />
              <h3 className="text-sm font-semibold">Delete Column?</h3>
            </div>

            <p className="text-sm text-gray-600">
              {column.is_default ? (
                <span className="text-red-600 font-medium">
                  Cannot delete default columns.
                </span>
              ) : column.report_count > 0 ? (
                <>
                  This column has{" "}
                  <span className="font-semibold">{column.report_count}</span>{" "}
                  report{column.report_count !== 1 ? "s" : ""}. Please move or
                  complete them before deleting.
                </>
              ) : (
                <>
                  Are you sure you want to delete{" "}
                  <span className="font-semibold">{column.name}</span>? This
                  action cannot be undone.
                </>
              )}
            </p>

            {error && (
              <div className="text-xs text-red-600 flex items-center gap-1">
                <MdWarning className="text-sm" />
                {error}
              </div>
            )}

            <div className="flex gap-2">
              <button
                onClick={() => setViewMode("menu")}
                disabled={isProcessing}
                className="flex-1 px-3 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
              >
                Cancel
              </button>
              {!column.is_default && column.report_count === 0 && (
                <button
                  onClick={handleDelete}
                  disabled={isProcessing}
                  className="flex-1 px-3 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium flex items-center justify-center gap-1"
                >
                  <MdDelete className="text-lg" />
                  {isProcessing ? "Deleting..." : "Delete"}
                </button>
              )}
            </div>
          </div>
        );

      default: // menu
        return (
          <div className="py-1">
            <button
              onClick={() => setViewMode("rename")}
              disabled={column.is_default}
              className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <MdEdit className="text-gray-400" />
              <span>Rename</span>
              {column.is_default && (
                <span className="ml-auto text-xs text-gray-400">Default</span>
              )}
            </button>

            <button
              onClick={() => setViewMode("color")}
              className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-3"
            >
              <MdPalette className="text-gray-400" />
              <span>Change Color</span>
            </button>

            <div className="border-t border-gray-200 my-1" />

            <button
              onClick={() => setViewMode("delete-confirm")}
              disabled={column.is_default}
              className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <MdDelete className="text-red-500" />
              <span>Delete Column</span>
              {column.is_default && (
                <span className="ml-auto text-xs text-gray-400">Protected</span>
              )}
            </button>
          </div>
        );
    }
  };

  return (
    <AnchoredPopup
      isOpen={isOpen}
      onClose={handleClose}
      anchorEl={anchorEl}
      placement="bottom-right"
    >
      {renderContent()}
    </AnchoredPopup>
  );
}
