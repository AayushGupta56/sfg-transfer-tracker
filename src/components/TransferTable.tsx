import Link from "next/link";
import { StatusBadge } from "./StatusBadge";
import { ageOf, fmtDateTime, isOverdue } from "@/lib/format";

type Row = {
  id: number;
  transferNo: string | null;
  fromPlantCode: string;
  toPlantCode: string;
  jobOrderNo: string;
  status: string;
  sentBy: string;
  sentAt: Date;
  receivedAt: Date | null;
  resolvedAt: Date | null;
  lines: { materialNumber: string; qtySent: number; qtyReceived: number | null }[];
};

export function TransferTable({
  rows,
  plantName,
  empty,
  action,
}: {
  rows: Row[];
  plantName: (code: string) => string;
  empty: string;
  action?: "receive";
}) {
  if (rows.length === 0) return <div className="empty">{empty}</div>;
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Transfer</th>
            <th>Route</th>
            <th>Job order</th>
            <th>Parts</th>
            <th>Sent</th>
            <th>Status</th>
            {action && <th></th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((t) => {
            const sent = t.lines.reduce((s, l) => s + l.qtySent, 0);
            const got = t.lines.reduce((s, l) => s + (l.qtyReceived ?? 0), 0);
            return (
              <tr key={t.id} className={isOverdue(t) ? "row-overdue" : ""}>
                <td>
                  <Link href={`/transfers/${t.id}`} className="mono">
                    {t.transferNo}
                  </Link>
                </td>
                <td className="nowrap">
                  {plantName(t.fromPlantCode)} → {plantName(t.toPlantCode)}
                </td>
                <td>
                  <Link href={`/job-orders/${t.jobOrderNo}`}>{t.jobOrderNo}</Link>
                </td>
                <td className="small">
                  {t.lines.map((l) => `${l.materialNumber} × ${l.qtySent}`).join(", ")}
                  <div className="muted">
                    {sent} pcs sent{t.receivedAt ? ` · ${got} counted` : ""}
                  </div>
                </td>
                <td className="small nowrap">
                  {fmtDateTime(t.sentAt)}
                  <div className="muted">
                    by {t.sentBy}
                    {t.status === "IN_TRANSIT" && ` · ${ageOf(t.sentAt)} ago`}
                  </div>
                </td>
                <td>
                  <StatusBadge t={t} />
                </td>
                {action === "receive" && (
                  <td>
                    <Link href={`/transfers/${t.id}/receive`} className="btn small">
                      Count &amp; confirm
                    </Link>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
