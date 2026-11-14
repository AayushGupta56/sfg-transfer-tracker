import { OVERDUE_HOURS, TIME_ZONE } from "./constants";

export function fmtDateTime(d: Date | string | null | undefined) {
  if (!d) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: TIME_ZONE,
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(d));
}

/** "3h 20m", "2d 4h" */
export function fmtDuration(ms: number) {
  const mins = Math.max(0, Math.floor(ms / 60000));
  const d = Math.floor(mins / 1440);
  const h = Math.floor((mins % 1440) / 60);
  const m = mins % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export function ageOf(d: Date | string) {
  return fmtDuration(Date.now() - new Date(d).getTime());
}

export function isOverdue(t: { status: string; sentAt: Date | string }) {
  return t.status === "IN_TRANSIT" && Date.now() - new Date(t.sentAt).getTime() > OVERDUE_HOURS * 3600_000;
}

export function overdueCutoff() {
  return new Date(Date.now() - OVERDUE_HOURS * 3600_000);
}
