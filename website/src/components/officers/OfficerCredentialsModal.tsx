"use client";

import { type ReactNode, useState } from "react";
import { LuCheck, LuCopy, LuKeyRound, LuMail } from "react-icons/lu";
import { Button } from "@/src/ui/Button";
import { Modal } from "@/src/ui/Modal";
import type { OfficerGeneratedCredentials } from "@/src/types/officers";

interface OfficerCredentialsModalProps {
  isOpen: boolean;
  credentials: OfficerGeneratedCredentials;
  supportUnit: "ward" | "municipality";
  onClose: () => void;
}

type CopyField = "email" | "password" | null;

function CredentialRow(props: {
  label: string;
  value: string;
  icon: ReactNode;
  isCopied: boolean;
  onCopy: () => void;
}) {
  const { label, value, icon, isCopied, onCopy } = props;

  return (
    <div className="rounded-[24px] border border-slate-200 bg-slate-50/80 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            {label}
          </p>
          <div className="mt-3 flex items-center gap-3">
            <div className="rounded-2xl bg-white p-2 text-slate-500 shadow-sm">
              {icon}
            </div>
            <p className="min-w-0 break-all font-medium text-slate-900">
              {value}
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="rounded-xl"
          leftIcon={isCopied ? <LuCheck /> : <LuCopy />}
          onClick={onCopy}
        >
          {isCopied ? "Copied" : "Copy"}
        </Button>
      </div>
    </div>
  );
}

export function OfficerCredentialsModal({
  isOpen,
  credentials,
  supportUnit,
  onClose,
}: OfficerCredentialsModalProps) {
  const [copiedField, setCopiedField] = useState<CopyField>(null);

  const handleCopy = async (field: Exclude<CopyField, null>, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedField(field);
      window.setTimeout(() => {
        setCopiedField((current) => (current === field ? null : current));
      }, 1600);
    } catch {
      setCopiedField(null);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Officer credentials"
      description="These credentials are shown once after creation. Copy them somewhere secure before closing."
      size="md"
    >
      <div className="space-y-5">
        <div className="rounded-[28px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          The officer should change this password on first login. After that,
          any later reset should be handled by the {supportUnit}.
        </div>

        <CredentialRow
          label="Email"
          value={credentials.email}
          icon={<LuMail className="text-lg" />}
          isCopied={copiedField === "email"}
          onCopy={() => {
            void handleCopy("email", credentials.email);
          }}
        />

        <CredentialRow
          label="Temporary password"
          value={credentials.password}
          icon={<LuKeyRound className="text-lg" />}
          isCopied={copiedField === "password"}
          onCopy={() => {
            void handleCopy("password", credentials.password);
          }}
        />

        <div className="flex justify-end border-t border-slate-100 pt-4">
          <Button className="rounded-xl" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </Modal>
  );
}
