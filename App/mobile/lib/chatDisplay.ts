// Shared presentation helpers for chat list rows, used by both the main
// officer Messages screen and the Archived screen so the two stay in sync.

import { Ionicons } from "@expo/vector-icons";
import type { ChatSummary } from "@/api/chat";

export function formatTime(dateStr: string | null): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffHours < 1) return "now";
  if (diffHours < 24) return `${diffHours}h`;
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return d.toLocaleDateString([], { weekday: "short" });
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

export function preview(msg: ChatSummary["last_message"]): string {
  if (!msg) return "No messages yet";
  if (msg.type === "image") return "Photo";
  if (msg.type === "file") {
    return msg.mime_type === "application/pdf" ? "PDF" : "File";
  }
  if (msg.type === "audio") return "Voice note";
  return msg.body ?? "No messages yet";
}

export function titleFor(chat: ChatSummary): string {
  // display_title is computed server-side as the other participant's name.
  // Always prefer it over the stored title for 1-on-1 chats, because the
  // stored title was set from the creator's perspective and may be the
  // viewer's own name.
  if (chat.display_title) return chat.display_title;
  if (chat.title) return chat.title;
  switch (chat.type) {
    case "ward_municipality":
      return "Municipality office";
    case "officer_ward":
      return "Ward office";
    case "complaint_case":
      return "Case chat";
    default:
      return "Conversation";
  }
}

export function iconFor(type: string): keyof typeof Ionicons.glyphMap {
  switch (type) {
    case "ward_municipality":
    case "officer_ward":
      return "business";
    case "complaint_case":
      return "alert-circle";
    default:
      return "people";
  }
}
