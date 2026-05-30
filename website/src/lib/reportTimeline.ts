const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export const INCOMING_ACK_HOURS = 24;
export const MUNICIPALITY_ESCALATION_ACK_HOURS = 24;
export const REPORT_NOT_SEEN_DAYS = 3;
export const DEFAULT_ACTIVE_DEADLINE_DAYS = 7;
export const DEADLINE_REASON_THRESHOLD_DAYS = 30;

export const HAPPINESS_PENALTIES = {
  incoming_not_seen_24h: 5,
  report_not_seen_escalation: 10,
  deadline_missed_escalation: 8,
} as const;

export function addHours(date: Date, hours: number) {
  return new Date(date.getTime() + hours * HOUR_MS);
}

export function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * DAY_MS);
}

export function getIncomingAckDeadlineAt(referenceAt: Date) {
  return addHours(referenceAt, INCOMING_ACK_HOURS);
}

export function getMunicipalityEscalationAckDeadlineAt(referenceAt: Date) {
  return addHours(referenceAt, MUNICIPALITY_ESCALATION_ACK_HOURS);
}

export function getDefaultActiveDeadlineAt(referenceAt: Date) {
  return addDays(referenceAt, DEFAULT_ACTIVE_DEADLINE_DAYS);
}

export function getDeadlineReasonThresholdAt(referenceAt: Date) {
  return addDays(referenceAt, DEADLINE_REASON_THRESHOLD_DAYS);
}

export function requiresDeadlineReason(
  baselineAt: Date,
  deadlineAt: Date,
) {
  return deadlineAt.getTime() > getDeadlineReasonThresholdAt(baselineAt).getTime();
}

export function getWardHappinessScore(totalPenaltyPoints: number) {
  return Math.max(0, 100 - totalPenaltyPoints);
}
