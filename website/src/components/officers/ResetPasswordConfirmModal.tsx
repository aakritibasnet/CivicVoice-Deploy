"use client";

import { LuKeyRound } from "react-icons/lu";
import { Button } from "@/src/ui/Button";
import { Modal } from "@/src/ui/Modal";

interface ResetPasswordConfirmModalProps {
  isOpen: boolean;
  officerName: string;
  isResetting?: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export function ResetPasswordConfirmModal({
  isOpen,
  officerName,
  isResetting = false,
  onClose,
  onConfirm,
}: ResetPasswordConfirmModalProps) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Reset officer password"
      description="A temporary password will be generated. The officer must set a new password on next login."
      size="md"
    >
      <div className="space-y-6">
        <div className="rounded-3xl border border-amber-100 bg-amber-50 p-5">
          <div className="flex items-start gap-3">
            <LuKeyRound className="mt-0.5 shrink-0 text-amber-600" />
            <p className="text-sm leading-6 text-amber-900">
              Reset password for{" "}
              <span className="font-semibold">{officerName}</span>? A temporary
              password will be shown once — share it with the officer
              securely. They will be prompted to set a new password on their
              next login.
            </p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3">
          <Button
            variant="ghost"
            className="rounded-xl"
            onClick={onClose}
            disabled={isResetting}
          >
            Cancel
          </Button>
          <Button
            variant="outline"
            className="rounded-xl border-amber-200 text-amber-700 hover:bg-amber-50"
            onClick={onConfirm}
            isLoading={isResetting}
            leftIcon={<LuKeyRound />}
          >
            Reset password
          </Button>
        </div>
      </div>
    </Modal>
  );
}
