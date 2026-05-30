import type { ReportViewerRole } from "@/src/types/report-posts";

export function canViewerRate(role?: ReportViewerRole | null) {
  return role === "citizen";
}

export function canViewerBookmark(role?: ReportViewerRole | null) {
  return role === "citizen";
}

export function canViewerComment(role?: ReportViewerRole | null) {
  return Boolean(role);
}

export function canViewerEdit(role?: ReportViewerRole | null) {
  return role === "ward" || role === "municipality" || role === "admin" || role === "officer";
}
