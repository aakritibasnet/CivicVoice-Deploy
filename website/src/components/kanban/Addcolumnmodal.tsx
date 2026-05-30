"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useMutation } from "@apollo/client/react";
import { LuX, LuPlus, LuLoader, LuCheck } from "react-icons/lu";
import {
  CREATE_KANBAN_COLUMN,
  GET_KANBAN_BOARD,
} from "@/src/graphql/operations/kanban";

type report_status = "incoming" | "in_progress" | "completed" | "returned" | "invalid";

// ─── Random Color Palette (no gradients) ─────────────
const COLUMN_COLORS = [
  "#ef4444", // red
  "#f97316", // orange
  "#f59e0b", // amber
  "#eab308", // yellow
  "#84cc16", // lime
  "#22c55e", // green
  "#14b8a6", // teal
  "#06b6d4", // cyan
  "#0ea5e9", // sky
  "#3b82f6", // blue
  "#6366f1", // indigo
  "#8b5cf6", // violet
  "#a855f7", // purple
  "#d946ef", // fuchsia
  "#ec4899", // pink
  "#f43f5e", // rose
  "#6b7280", // gray
  "#78716c", // stone
];

function getRandomColor(): string {
  return COLUMN_COLORS[Math.floor(Math.random() * COLUMN_COLORS.length)];
}

// ─── Status Options ──────────────────────────────────
const STATUS_OPTIONS: { value: report_status; label: string }[] = [
  { value: "incoming", label: "Incoming" },
  { value: "in_progress", label: "In Progress" },
  { value: "completed", label: "Completed" },
  { value: "returned", label: "Returned" },
  { value: "invalid", label: "Invalid" },
];

// ─── Props ───────────────────────────────────────────
interface AddColumnModalProps {
  isOpen: boolean;
  onClose: () => void;
  existingColumnCount: number;
}

export default function AddColumnModal({
  isOpen,
  onClose,
  existingColumnCount,
}: AddColumnModalProps) {
  // ─── Form State ─────────────────────────────────
  const [name, setName] = useState("");
  const [color, setColor] = useState(getRandomColor);
  const [mappedStatus, setMappedStatus] = useState<report_status>("incoming");
  const [isTerminal, setIsTerminal] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const nameInputRef = useRef<HTMLInputElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  // ─── Mutation ───────────────────────────────────
  const [createColumn, { loading }] = useMutation(CREATE_KANBAN_COLUMN, {
    refetchQueries: [{ query: GET_KANBAN_BOARD }],
    onCompleted: () => {
      resetForm();
      onClose();
    },
    onError: (err) => {
      setErrors({ submit: err.message });
    },
  });

  // ─── Reset form on open ────────────────────────
  const resetForm = useCallback(() => {
    setName("");
    setColor(getRandomColor());
    setMappedStatus("incoming");
    setIsTerminal(false);
    setErrors({});
  }, []);

  useEffect(() => {
    if (isOpen) {
      resetForm();
      setTimeout(() => nameInputRef.current?.focus(), 150);
    }
  }, [isOpen, resetForm]);

  // ─── Close on Escape ───────────────────────────
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  // ─── Backdrop click ────────────────────────────
  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === overlayRef.current) onClose();
  };

  // ─── Validation & Submit ───────────────────────
  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};
    if (!name.trim()) newErrors.name = "Column name is required";
    if (name.trim().length > 100)
      newErrors.name = "Name must be 100 characters or less";
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = () => {
    if (!validate() || loading) return;

    createColumn({
      variables: {
        input: {
          name: name.trim(),
          position: existingColumnCount,
          color,
          is_terminal: isTerminal,
          mapped_status: mappedStatus,
        },
      },
    });
  };

  // ─── Don't render when closed ──────────────────
  if (!isOpen) return null;

  return (
    <div
      ref={overlayRef}
      onClick={handleOverlayClick}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm animate-in fade-in duration-200"
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-4 duration-200">
        {/* ─── Header ─────────────────────────── */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2.5">
            <div
              className="h-3 w-3 rounded-full transition-colors duration-200"
              style={{ backgroundColor: color }}
            />
            <h2 className="text-lg font-semibold text-gray-900">Add Column</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
          >
            <LuX className="w-5 h-5" />
          </button>
        </div>

        {/* ─── Body ───────────────────────────── */}
        <div className="px-6 py-5 space-y-5">
          {/* Submit error */}
          {errors.submit && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
              {errors.submit}
            </div>
          )}

          {/* Name */}
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-gray-700">
              Name <span className="text-red-400">*</span>
            </label>
            <input
              ref={nameInputRef}
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (errors.name) setErrors((prev) => ({ ...prev, name: "" }));
              }}
              placeholder="e.g. Under Review, In Progress…"
              className={`w-full px-3 py-2 rounded-lg border text-sm placeholder:text-gray-400 outline-none transition-all
                ${errors.name ? "border-red-300 focus:ring-2 focus:ring-red-100" : "border-gray-200 focus:border-blue-400 focus:ring-2 focus:ring-blue-100"}`}
              maxLength={100}
            />
            {errors.name && (
              <p className="text-xs text-red-500">{errors.name}</p>
            )}
          </div>

          {/* Color */}
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-gray-700">
              Color
            </label>
            <div className="flex flex-wrap gap-2">
              {COLUMN_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={`w-7 h-7 rounded-full border-2 transition-all duration-150 flex items-center justify-center
                    ${color === c ? "border-gray-900 scale-110 shadow-sm" : "border-transparent hover:scale-105 hover:border-gray-300"}`}
                  style={{ backgroundColor: c }}
                  title={c}
                >
                  {color === c && (
                    <LuCheck className="w-3.5 h-3.5 text-white drop-shadow" />
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Mapped Status */}
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-gray-700">
              Mapped Status <span className="text-red-400">*</span>
            </label>
            <select
              value={mappedStatus}
              onChange={(e) => setMappedStatus(e.target.value as report_status)}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all bg-white"
            >
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <p className="text-xs text-gray-400">
              Reports moved to this column will be set to this status.
            </p>
          </div>

          {/* Is Terminal */}
          <div className="flex items-start gap-3">
            <button
              type="button"
              role="switch"
              aria-checked={isTerminal}
              onClick={() => setIsTerminal((prev) => !prev)}
              className={`relative mt-0.5 inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors duration-200
                ${isTerminal ? "bg-blue-500" : "bg-gray-200"}`}
            >
              <span
                className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform duration-200
                  ${isTerminal ? "translate-x-4" : "translate-x-0.5"}`}
              />
            </button>
            <div>
              <label className="text-sm font-medium text-gray-700">
                Terminal Column
              </label>
              <p className="text-xs text-gray-400 mt-0.5">
                Mark as a final state — reports here are considered closed.
              </p>
            </div>
          </div>
        </div>

        {/* ─── Footer ─────────────────────────── */}
        <div className="flex items-center justify-end gap-2.5 px-6 py-4 border-t border-gray-100 bg-gray-50/50">
          <button
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800 rounded-lg hover:bg-gray-100 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading || !name.trim()}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
          >
            {loading ? (
              <>
                <LuLoader className="w-4 h-4 animate-spin" />
                Creating…
              </>
            ) : (
              <>
                <LuPlus className="w-4 h-4" />
                Add Column
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
