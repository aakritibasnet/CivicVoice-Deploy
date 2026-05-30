"use client";

import { useEffect, useRef, useState } from "react";
import { useAuthStore } from "@/src/store/auth-store";
import { LuFile, LuDownload, LuImageOff } from "react-icons/lu";

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:5000";

type Props = {
  attachmentId: string;
  mimeType: string;
  fileName: string;
  sizeBytes: number;
};

export function ChatAttachment({ attachmentId, mimeType, fileName, sizeBytes }: Props) {
  const token = useAuthStore((s) => s.token);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const blobRef = useRef<string | null>(null);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    setError(false);

    fetch(`${BACKEND}/api/chat/attachments/${attachmentId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => {
        if (!r.ok) throw new Error("fetch failed");
        return r.blob();
      })
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        blobRef.current = url;
        setBlobUrl(url);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));

    return () => {
      if (blobRef.current) {
        URL.revokeObjectURL(blobRef.current);
        blobRef.current = null;
      }
    };
  }, [attachmentId, token]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-1">
        <div className="h-4 w-4 border-2 border-current border-t-transparent rounded-full animate-spin opacity-60" />
        <span className="text-xs opacity-60">Loading…</span>
      </div>
    );
  }

  if (error || !blobUrl) {
    return (
      <div className="flex items-center gap-1.5 text-xs opacity-60">
        <LuImageOff className="h-4 w-4" />
        <span>Could not load</span>
      </div>
    );
  }

  if (mimeType.startsWith("image/")) {
    return (
      <img
        src={blobUrl}
        alt={fileName}
        className="max-w-[260px] max-h-64 rounded-lg object-cover cursor-pointer hover:opacity-90 transition-opacity"
        onClick={() => window.open(blobUrl, "_blank")}
      />
    );
  }

  const kb = Math.round(sizeBytes / 1024);
  const sizeLabel = kb >= 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${kb} KB`;

  return (
    <a
      href={blobUrl}
      download={fileName}
      className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-black/10 hover:bg-black/20 transition-colors min-w-[160px] max-w-[240px]"
    >
      <LuFile className="h-5 w-5 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium truncate">{fileName}</p>
        <p className="text-xs opacity-60">{sizeLabel}</p>
      </div>
      <LuDownload className="h-4 w-4 flex-shrink-0 opacity-70" />
    </a>
  );
}
