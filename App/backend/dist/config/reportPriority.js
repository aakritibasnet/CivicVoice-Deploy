// Accepted range: keep these values in sync with the database priority_level enum.
export const REPORT_PRIORITY_CONFIG = {
    levels: ["low", "medium", "high", "critical"],
    defaultLevel: "medium",
};
export function isReportPriorityLevel(value) {
    return REPORT_PRIORITY_CONFIG.levels.includes(value);
}
