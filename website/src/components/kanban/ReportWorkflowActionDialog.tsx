"use client";

import React, { useState } from "react";
import { Modal } from "@/src/ui/Modal";

export type WorkflowActionKey =
  | "mark_in_progress"
  | "mark_completed"
  | "mark_invalid"
  | "escalate_to_municipality"
  | "return_to_ward";

export interface WorkflowActionConfig {
  key: WorkflowActionKey;
  title: string;
  description: string;
  submitLabel: string;
  reasonLabel?: string;
  reasonPlaceholder?: string;
  requiresReason?: boolean;
  instructionsLabel?: string;
  instructionsPlaceholder?: string;
  deadlineLabel?: string;
  deadlineRequired?: boolean;
}

interface ReportWorkflowActionDialogProps {
  action: WorkflowActionConfig | null;
  isOpen: boolean;
  isSubmitting?: boolean;
  onClose: () => void;
  onSubmit: (input: {
    reason?: string;
    instructions?: string;
    deadline_at?: string;
  }) => Promise<void>;
}

export default function ReportWorkflowActionDialog({
  action,
  isOpen,
  isSubmitting = false,
  onClose,
  onSubmit,
}: ReportWorkflowActionDialogProps) {
  const [reason, setReason] = useState("");
  const [instructions, setInstructions] = useState("");
  const [deadlineAt, setDeadlineAt] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (!action) return null;

  const handleSubmit = async () => {
    if (action.requiresReason && reason.trim().length < 10) {
      setError("Please provide at least 10 characters of context.");
      return;
    }

    if (action.deadlineRequired && !deadlineAt) {
      setError("Please choose a deadline before continuing.");
      return;
    }

    setError(null);
    await onSubmit({
      reason: reason.trim() || undefined,
      instructions: instructions.trim() || undefined,
      deadline_at: deadlineAt ? new Date(deadlineAt).toISOString() : undefined,
    });
  };

  return (
    <Modal isOpen={isOpen} onClose={isSubmitting ? () => {} : onClose} size="lg">
      <div className="space-y-5">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">{action.title}</h3>
          <p className="mt-1 text-sm text-gray-500">{action.description}</p>
        </div>

        {action.requiresReason && (
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-gray-700">
              {action.reasonLabel ?? "Reason"} <span className="text-red-500">*</span>
            </label>
            <textarea
              value={reason}
              onChange={(event) => {
                setReason(event.target.value);
                if (error) setError(null);
              }}
              rows={4}
              disabled={isSubmitting}
              placeholder={action.reasonPlaceholder}
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900 outline-none transition-colors focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:opacity-50"
            />
          </div>
        )}

        {action.instructionsLabel && (
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-gray-700">
              {action.instructionsLabel}
            </label>
            <textarea
              value={instructions}
              onChange={(event) => setInstructions(event.target.value)}
              rows={3}
              disabled={isSubmitting}
              placeholder={action.instructionsPlaceholder}
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900 outline-none transition-colors focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:opacity-50"
            />
          </div>
        )}

        {action.deadlineLabel && (
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-gray-700">
              {action.deadlineLabel}
              {action.deadlineRequired ? (
                <span className="text-red-500"> *</span>
              ) : null}
            </label>
            <input
              type="datetime-local"
              value={deadlineAt}
              onChange={(event) => setDeadlineAt(event.target.value)}
              disabled={isSubmitting}
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900 outline-none transition-colors focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:opacity-50"
            />
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="flex items-center justify-end gap-3 border-t border-gray-100 pt-4">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
          >
            {isSubmitting ? "Saving..." : action.submitLabel}
          </button>
        </div>
      </div>
    </Modal>
  );
}
