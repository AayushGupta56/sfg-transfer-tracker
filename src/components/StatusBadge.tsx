import { STATUS_LABELS } from "@/lib/constants";
import { isOverdue } from "@/lib/format";

type T = { status: string; sentAt: Date | string; resolvedAt?: Date | string | null };

export function StatusBadge({ t }: { t: T }) {
  return (
    <span className="nowrap">
      <span className={`badge ${t.status}`}>{STATUS_LABELS[t.status] ?? t.status}</span>
      {isOverdue(t) && <> <span className="badge overdue">Overdue</span></>}
      {t.status === "RECEIVED_WITH_DISCREPANCY" && (
        <> {t.resolvedAt ? <span className="badge resolved">Resolved</span> : <span className="badge overdue">Open</span>}</>
      )}
    </span>
  );
}
