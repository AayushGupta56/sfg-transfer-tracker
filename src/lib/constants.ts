// A transfer still IN_TRANSIT after this many hours is flagged as overdue.
// Assumption: plants are close enough that SFGs should arrive the same working day.
export const OVERDUE_HOURS = 24;

export const TIME_ZONE = "Asia/Dubai";

export const DEPARTMENTS: Record<string, string> = {
  HEADERS: "Headers",
  SHEET_METAL: "Sheet Metal",
};

export const DISCREPANCY_REASONS: Record<string, string> = {
  SHORT: "Short — fewer parts arrived than sent",
  EXCESS: "Excess — more parts arrived than sent",
  DAMAGED: "Damaged — parts arrived but are not usable",
  WRONG_PART: "Wrong part — different material arrived",
  OTHER: "Other (explain in note)",
};

export const STATUS_LABELS: Record<string, string> = {
  IN_TRANSIT: "In transit",
  RECEIVED: "Received",
  RECEIVED_WITH_DISCREPANCY: "Received – discrepancy",
  CANCELLED: "Cancelled",
};

export const EVENT_LABELS: Record<string, string> = {
  SENT: "Sent",
  RECEIVED: "Received (matches)",
  RECEIVED_WITH_DISCREPANCY: "Received with discrepancy",
  CANCELLED: "Cancelled",
  DISCREPANCY_RESOLVED: "Discrepancy resolved",
  SAP_SYNCED: "Posted to SAP",
};
