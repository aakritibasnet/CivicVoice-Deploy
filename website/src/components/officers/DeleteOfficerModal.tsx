"use client";

import { Button } from "@/src/ui/Button";
import { Modal } from "@/src/ui/Modal";

interface DeleteOfficerModalProps {
  isOpen: boolean;
  officerName: string;
  isDeleting?: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export function DeleteOfficerModal({
  isOpen,
  officerName,
  isDeleting = false,
  onClose,
  onConfirm,
}: DeleteOfficerModalProps) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Delete officer"
      description="This removes the officer from the directory state used by the dashboard."
      size="md"
    >
      <div className="space-y-6">
        <div className="rounded-3xl border border-red-100 bg-red-50 p-5">
          <p className="text-sm leading-6 text-red-900">
            Delete <span className="font-semibold">{officerName}</span>? This
            action cannot be undone from the current page.
          </p>
        </div>

        <div className="flex items-center justify-end gap-3">
          <Button
            variant="ghost"
            className="rounded-xl"
            onClick={onClose}
            disabled={isDeleting}
          >
            Cancel
          </Button>
          <Button
            variant="danger"
            className="rounded-xl"
            onClick={onConfirm}
            isLoading={isDeleting}
          >
            Delete officer
          </Button>
        </div>
      </div>
    </Modal>
  );
}
