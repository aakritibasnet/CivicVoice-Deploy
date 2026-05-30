"use client";

import { useState } from "react";
import { Modal } from "@/src/ui/Modal";
import { Button } from "@/src/ui/Button";

interface ReportDeadlineDialogProps {
  isOpen: boolean;
  isSubmitting?: boolean;
  initialDeadlineAt?: string | null;
  reasonThresholdAt?: string | null;
  onClose: () => void;
  onSubmit: (input: { deadline_at: string; reason?: string }) => Promise<void>;
}

function toInputDateTime(value?: string | null) {
  if (!value) {
    return "";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60 * 1000);
  return local.toISOString().slice(0, 16);
}

export default function ReportDeadlineDialog({
  isOpen,
  isSubmitting = false,
  initialDeadlineAt,
  reasonThresholdAt,
  onClose,
  onSubmit,
}: ReportDeadlineDialogProps) {
  const [deadlineAt, setDeadlineAt] = useState(() =>
    toInputDateTime(initialDeadlineAt),
  );
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const reasonIsRequired =
    typeof reasonThresholdAt === "string" &&
    deadlineAt.length > 0 &&
    new Date(deadlineAt).getTime() > new Date(reasonThresholdAt).getTime();

  const handleSubmit = async () => {
    if (!deadlineAt) {
      setError("Choose a deadline before saving.");
      return;
    }

    if (reasonIsRequired && reason.trim().length === 0) {
      setError("A reason is required for deadlines beyond one month.");
      return;
    }

    setError(null);
    await onSubmit({
      deadline_at: new Date(deadlineAt).toISOString(),
      reason: reason.trim() || undefined,
    });
  };

  return (
    <Modal isOpen={isOpen} onClose={isSubmitting ? () => {} : onClose} size="lg">
      <div className="space-y-5">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Update deadline</h3>
          <p className="mt-1 text-sm text-gray-500">
            Adjust the working deadline for this task. A reason is only required
            when the deadline extends beyond one month.
          </p>
        </div>

        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-gray-700">
            Deadline <span className="text-red-500">*</span>
          </label>
          <input
            type="datetime-local"
            value={deadlineAt}
            onChange={(event) => {
              setDeadlineAt(event.target.value);
              if (error) {
                setError(null);
              }
            }}
            disabled={isSubmitting}
            className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900 outline-none transition-colors focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:opacity-50"
          />
        </div>

        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-gray-700">
            Reason {reasonIsRequired ? <span className="text-red-500">*</span> : null}
          </label>
          <textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            rows={3}
            disabled={isSubmitting}
            placeholder="Optional context for the updated timeline..."
            className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900 outline-none transition-colors focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:opacity-50"
          />
        </div>

        {error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        <div className="flex items-center justify-end gap-3 border-t border-gray-100 pt-4">
          <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button onClick={() => void handleSubmit()} isLoading={isSubmitting}>
            Save deadline
          </Button>
        </div>
      </div>
    </Modal>
  );
}
