// Accepted range: keep these values in sync with the database priority_level enum.
export const REPORT_PRIORITY_CONFIG = {
  levels: ["low", "medium", "high", "critical"],
  defaultLevel: "medium",
} as const;

export type ReportPriorityLevel =
  (typeof REPORT_PRIORITY_CONFIG.levels)[number];

export function isReportPriorityLevel(
  value: unknown,
): value is ReportPriorityLevel {
  return REPORT_PRIORITY_CONFIG.levels.includes(value as ReportPriorityLevel);
}
