"use client";

import React, { useState, useRef, useCallback } from "react";
import {
  FiUpload,
  FiX,
  FiImage,
  FiLoader,
  FiAlertTriangle,
  FiCheckCircle,
  FiRepeat,
} from "react-icons/fi";

import { MdShield } from "react-icons/md";

import { Modal } from "@/src/ui/Modal";
import type {
  KanbanColumn as KanbanColumnType,
  ReportCard as ReportCardType,
} from "@/src/types/kanban";

// ─── Types ───────────────────────────────────────────
export interface ResolutionData {
  reason: string;
  proofImages: File[];
}

interface ResolutionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: ResolutionData) => Promise<void>;
  report: ReportCardType | null;
  sourceColumn: KanbanColumnType | null;
  targetColumn: KanbanColumnType | null;
}

// ─── Resolution type config ─────────────────────────
type ResolutionType =
  | "completed"
  | "invalid"
  | "reopened"
  | "transferred"
  | "returned"
  | "default";

interface ResolutionConfig {
  icon: React.ReactNode;
  title: string;
  description: string;
  reasonLabel: string;
  reasonPlaceholder: string;
  accentColor: string;
  accentBg: string;
  accentBorder: string;
  submitLabel: string;
  submitColor: string;
}

function getResolutionType(
  report: ReportCardType | null,
  targetColumn: KanbanColumnType | null,
): ResolutionType {
  if (!targetColumn) return "default";

  const name = targetColumn.name.toLowerCase();
  const status = targetColumn.mapped_status?.toLowerCase();

  if (
    report?.status === "completed" &&
    (status === "incoming" || status === "in_progress")
  ) {
    return "reopened";
  }

  if (
    status === "completed" ||
    name.includes("completed") ||
    name.includes("resolved")
  ) {
    return "completed";
  }
  if (
    status === "invalid" ||
    name.includes("invalid") ||
    name.includes("rejected")
  ) {
    return "invalid";
  }
  if (
    name.includes("transfer") ||
    name.includes("municipality") ||
    name.includes("escalat")
  ) {
    return "transferred";
  }
  if (status === "returned" || name.includes("returned")) {
    return "returned";
  }
  return "default";
}

function getResolutionConfig(type: ResolutionType): ResolutionConfig {
  switch (type) {
    case "reopened":
      return {
        icon: <FiRepeat className="text-xl" />,
        title: "Re-open Task",
        description:
          "Explain why this completed task is being reopened. Citizens will be able to see that the task was reopened and the reason behind it.",
        reasonLabel: "Re-open Reason",
        reasonPlaceholder:
          "Explain why this completed task needs more work or follow-up...",
        accentColor: "text-amber-700",
        accentBg: "bg-amber-50",
        accentBorder: "border-amber-200",
        submitLabel: "Re-open Task",
        submitColor:
          "bg-amber-600 hover:bg-amber-700 focus-visible:ring-amber-500",
      };
    case "completed":
      return {
        icon: <FiCheckCircle className="text-xl" />,
        title: "Complete Report",
        description:
          "Provide details about how this issue was resolved. This will be visible in the report history for transparency and audit purposes.",
        reasonLabel: "Resolution Description",
        reasonPlaceholder:
          "Describe how this issue was resolved. Include what actions were taken, resources used, and the outcome...",
        accentColor: "text-green-700",
        accentBg: "bg-green-50",
        accentBorder: "border-green-200",
        submitLabel: "Mark as Completed",
        submitColor:
          "bg-green-600 hover:bg-green-700 focus-visible:ring-green-500",
      };
    case "invalid":
      return {
        icon: <MdShield className="text-xl" />,
        title: "Mark as Invalid",
        description:
          "Explain why this report is being marked as invalid. This reason will be recorded for accountability.",
        reasonLabel: "Reason for Invalidation",
        reasonPlaceholder:
          "Explain why this report is invalid. E.g., duplicate report, insufficient information, outside jurisdiction, false report...",
        accentColor: "text-red-700",
        accentBg: "bg-red-50",
        accentBorder: "border-red-200",
        submitLabel: "Mark as Invalid",
        submitColor: "bg-red-600 hover:bg-red-700 focus-visible:ring-red-500",
      };
    case "transferred":
      return {
        icon: <FiRepeat className="text-xl" />,
        title: "Transfer to Municipality",
        description:
          "Document why this issue is being escalated or transferred. Include any relevant context for the receiving team.",
        reasonLabel: "Transfer Reason",
        reasonPlaceholder:
          "Explain why this report needs to be transferred. E.g., requires municipal-level resources, outside ward jurisdiction, needs higher authority approval...",
        accentColor: "text-blue-700",
        accentBg: "bg-blue-50",
        accentBorder: "border-blue-200",
        submitLabel: "Transfer Report",
        submitColor:
          "bg-blue-600 hover:bg-blue-700 focus-visible:ring-blue-500",
      };
    case "returned":
      return {
        icon: <FiRepeat className="text-xl" />,
        title: "Return to Ward",
        description:
          "Explain why this report is being returned to the ward and include any instructions needed for follow-up.",
        reasonLabel: "Return Reason",
        reasonPlaceholder:
          "Explain why this report is being returned to the ward and what they should do next...",
        accentColor: "text-orange-700",
        accentBg: "bg-orange-50",
        accentBorder: "border-orange-200",
        submitLabel: "Return to Ward",
        submitColor:
          "bg-orange-600 hover:bg-orange-700 focus-visible:ring-orange-500",
      };
    default:
      return {
        icon: <FiAlertTriangle className="text-xl" />,
        title: "Confirm Status Change",
        description:
          "This action requires a reason. Please document why this change is being made.",
        reasonLabel: "Reason",
        reasonPlaceholder: "Describe the reason for this status change...",
        accentColor: "text-gray-700",
        accentBg: "bg-gray-50",
        accentBorder: "border-gray-200",
        submitLabel: "Confirm",
        submitColor:
          "bg-gray-800 hover:bg-gray-900 focus-visible:ring-gray-500",
      };
  }
}

// ─── Image Preview ───────────────────────────────────
function ImagePreview({
  file,
  onRemove,
}: {
  file: File;
  onRemove: () => void;
}) {
  const [preview, setPreview] = useState<string>("");

  React.useEffect(() => {
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  return (
    <div className="relative group rounded-lg overflow-hidden border border-gray-200 bg-gray-50 aspect-square">
      {preview && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={preview}
          alt={file.name}
          className="h-full w-full object-cover"
        />
      )}
      <button
        type="button"
        onClick={onRemove}
        className="absolute top-1 right-1 p-1 rounded-full bg-black/60 text-white opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer hover:bg-black/80"
        title="Remove image"
      >
        <FiX className="text-xs" />
      </button>
      <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/50 to-transparent px-1.5 py-1">
        <p className="text-[10px] text-white truncate">{file.name}</p>
      </div>
    </div>
  );
}

// ─── Main Modal Component ────────────────────────────
export default function ResolutionModal({
  isOpen,
  onClose,
  onSubmit,
  report,
  sourceColumn,
  targetColumn,
}: ResolutionModalProps) {
  const [reason, setReason] = useState("");
  const [proofImages, setProofImages] = useState<File[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const resolutionType = getResolutionType(report, targetColumn);
  const config = getResolutionConfig(resolutionType);

  // ─── Reset state when modal opens ──────────────
  React.useEffect(() => {
    if (isOpen) {
      setReason("");
      setProofImages([]);
      setIsSubmitting(false);
      setError(null);
    }
  }, [isOpen]);

  // ─── File handling ─────────────────────────────
  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files || []);
      const imageFiles = files.filter((f) => f.type.startsWith("image/"));

      const remaining = 5 - proofImages.length;
      const newFiles = imageFiles.slice(0, remaining);

      if (imageFiles.length > remaining) {
        setError(
          `Maximum 5 images allowed. ${imageFiles.length - remaining} file(s) were skipped.`,
        );
      }

      setProofImages((prev) => [...prev, ...newFiles]);

      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    },
    [proofImages.length],
  );

  const removeImage = useCallback((index: number) => {
    setProofImages((prev) => prev.filter((_, i) => i !== index));
    setError(null);
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!reason.trim()) {
      setError("Please provide a reason for this action.");
      return;
    }

    if (reason.trim().length < 10) {
      setError(
        "Please provide a more detailed explanation (at least 10 characters).",
      );
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      await onSubmit({
        reason: reason.trim(),
        proofImages,
      });
      onClose();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to submit. Please try again.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }, [reason, proofImages, onSubmit, onClose]);

  // ─── Drag and Drop ─────────────────────
  const [isDragOver, setIsDragOver] = useState(false);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);

      const files = Array.from(e.dataTransfer.files);
      const imageFiles = files.filter((f) => f.type.startsWith("image/"));

      const remaining = 5 - proofImages.length;
      const newFiles = imageFiles.slice(0, remaining);
      setProofImages((prev) => [...prev, ...newFiles]);
    },
    [proofImages.length],
  );

  if (!report || !targetColumn) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={isSubmitting ? () => {} : onClose}
      size="lg"
    >
      <div className="space-y-5">
        <div className="flex items-start gap-3">
          <div
            className={`h-10 w-10 rounded-lg ${config.accentBg} ${config.accentColor} flex items-center justify-center shrink-0`}
          >
            {config.icon}
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-semibold text-gray-900">
              {config.title}
            </h2>
            <p className="text-sm text-gray-500 mt-0.5">{config.description}</p>
          </div>
        </div>

        <div
          className={`rounded-lg border ${config.accentBorder} ${config.accentBg} p-3`}
        >
          <div className="flex items-center justify-between text-sm">
            <div className="min-w-0 flex-1">
              <p className="font-medium text-gray-900 truncate">
                {report.title}
              </p>
              <p className="text-xs text-gray-500 mt-0.5">
                ID: {report.id.slice(0, 8)}...
              </p>
            </div>
            <div className="flex items-center gap-2 text-xs text-gray-500 shrink-0 ml-3">
              {sourceColumn && (
                <>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-gray-200 bg-white">
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: sourceColumn.color }}
                    />
                    {sourceColumn.name}
                  </span>
                  <span className="text-gray-400">→</span>
                </>
              )}
              <span
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border ${config.accentBorder} bg-white font-medium ${config.accentColor}`}
              >
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: targetColumn.color }}
                />
                {targetColumn.name}
              </span>
            </div>
          </div>
        </div>

        <div className="space-y-1.5">
          <label
            htmlFor="resolution-reason"
            className="block text-sm font-medium text-gray-700"
          >
            {config.reasonLabel} <span className="text-red-500">*</span>
          </label>
          <textarea
            id="resolution-reason"
            value={reason}
            onChange={(e) => {
              setReason(e.target.value);
              if (error) setError(null);
            }}
            placeholder={config.reasonPlaceholder}
            rows={4}
            disabled={isSubmitting}
            className={`
              w-full rounded-lg border px-3 py-2.5 text-sm text-gray-900
              placeholder:text-gray-400 resize-none
              focus:outline-none focus:ring-2 focus:ring-offset-0
              disabled:opacity-50 disabled:cursor-not-allowed
              transition-colors
              ${
                error && !reason.trim()
                  ? "border-red-300 focus:ring-red-500 focus:border-red-500"
                  : "border-gray-300 focus:ring-blue-500 focus:border-blue-500"
              }
            `}
          />
          <div className="flex justify-between text-xs text-gray-400">
            <span>
              {reason.length < 10 && reason.length > 0
                ? `${10 - reason.length} more characters needed`
                : " "}
            </span>
            <span>{reason.length} characters</span>
          </div>
        </div>

        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-700">
            Proof / Evidence{" "}
            <span className="text-gray-400 font-normal">(optional)</span>
          </label>

          {proofImages.length > 0 && (
            <div className="grid grid-cols-5 gap-2">
              {proofImages.map((file, i) => (
                <ImagePreview
                  key={`${file.name}-${i}`}
                  file={file}
                  onRemove={() => removeImage(i)}
                />
              ))}
            </div>
          )}

          {proofImages.length < 5 && (
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`
                flex flex-col items-center justify-center py-5 px-4
                border-2 border-dashed rounded-lg cursor-pointer
                transition-colors text-center
                ${
                  isDragOver
                    ? "border-blue-400 bg-blue-50"
                    : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                }
                ${isSubmitting ? "opacity-50 pointer-events-none" : ""}
              `}
            >
              <div className="h-8 w-8 rounded-full bg-gray-100 flex items-center justify-center mb-2">
                {isDragOver ? (
                  <FiImage className="text-blue-500 text-sm" />
                ) : (
                  <FiUpload className="text-gray-400 text-sm" />
                )}
              </div>
              <p className="text-sm text-gray-600">
                {isDragOver ? (
                  "Drop images here"
                ) : (
                  <>
                    <span className="font-medium text-blue-600">
                      Click to upload
                    </span>{" "}
                    or drag and drop
                  </>
                )}
              </p>
              <p className="text-xs text-gray-400 mt-1">
                PNG, JPG, WEBP up to 5MB each • {5 - proofImages.length}{" "}
                remaining
              </p>
            </div>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={handleFileSelect}
            className="hidden"
          />
        </div>

        {error && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-200">
            <FiAlertTriangle className="text-red-500 text-sm mt-0.5 shrink-0" />
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        <div className="flex items-center justify-end gap-3 pt-2 border-t border-gray-100">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting || !reason.trim()}
            className={`
              px-5 py-2 text-sm font-medium text-white rounded-lg
              transition-colors disabled:opacity-50 cursor-pointer
              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2
              flex items-center gap-2
              ${config.submitColor}
            `}
          >
            {isSubmitting && <FiLoader className="text-sm animate-spin" />}
            {isSubmitting ? "Submitting..." : config.submitLabel}
          </button>
        </div>
      </div>
    </Modal>
  );
}
