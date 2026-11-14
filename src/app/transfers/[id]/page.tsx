import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { getActor } from "@/lib/session";
import { getPlantMap } from "@/lib/plants";
import { ageOf, fmtDateTime, fmtDuration, isOverdue } from "@/lib/format";
import { DISCREPANCY_REASONS, EVENT_LABELS, OVERDUE_HOURS, DEPARTMENTS } from "@/lib/constants";
import { StatusBadge } from "@/components/StatusBadge";
import { TransferActions } from "@/components/TransferActions";

export default async function TransferPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ created?: string; received?: string }>;
}) {
  const { id } = await params;
  const flags = await searchParams;
  const t = await prisma.transfer.findUnique({
    where: { id: Number(id) || 0 },
    include: { lines: { include: { material: true }, orderBy: { id: "asc" } }, events: { orderBy: { id: "asc" } } },
  });
  if (!t) notFound();
  const outbox = await prisma.outboxEvent.findMany({ where: { transferId: t.id }, orderBy: { id: "asc" } });
  const actor = await getActor();
  const { name } = await getPlantMap();

  const overdue = isOverdue(t);
  const sentTotal = t.lines.reduce((s, l) => s + l.qtySent, 0);
  const gotTotal = t.lines.reduce((s, l) => s + (l.qtyReceived ?? 0), 0);

  const banner = (() => {
    switch (t.status) {
      case "IN_TRANSIT":
        return {
          cls: overdue ? "overdue" : "IN_TRANSIT",
          title: overdue
            ? `Overdue — in transit for ${ageOf(t.sentAt)} (limit ${OVERDUE_HOURS}h)`
            : `In transit for ${ageOf(t.sentAt)}`,
          text: `Waiting for someone at ${name(t.toPlantCode)} to count the parts and confirm receipt. Until then ${name(t.fromPlantCode)} remains responsible.`,
        };
      case "RECEIVED":
        return {
          cls: "RECEIVED",
          title: "Received — counts match",
          text: `${t.receivedBy} at ${name(t.toPlantCode)} counted all ${gotTotal} pcs on ${fmtDateTime(t.receivedAt)}, ${fmtDuration(t.receivedAt!.getTime() - t.sentAt.getTime())} after sending.`,
        };
      case "RECEIVED_WITH_DISCREPANCY":
        return {
          cls: "RECEIVED_WITH_DISCREPANCY",
          title: t.resolvedAt ? "Received with discrepancy — resolved" : "Received with discrepancy — open",
          text: t.resolvedAt
            ? `Closed by ${t.resolvedBy} on ${fmtDateTime(t.resolvedAt)}: “${t.resolutionNote}”`
            : `${name(t.fromPlantCode)} sent ${sentTotal} pcs, ${name(t.toPlantCode)} counted ${gotTotal} usable pcs. The two plants should agree what happened and close it with a note.`,
        };
      default:
        return {
          cls: "CANCELLED",
          title: "Cancelled by sender",
          text: `${t.cancelledBy} cancelled on ${fmtDateTime(t.cancelledAt)}: “${t.cancelReason}”`,
        };
    }
  })();

  return (
    <>
      {flags.created && (
        <div className="alert success no-print">
          Transfer <strong>{t.transferNo}</strong> created. Print the slip and send it with the parts — the receiving
          plant uses this number to find and confirm it.
        </div>
      )}
      {flags.received && <div className="alert success no-print">Receipt recorded. The trail below is updated.</div>}

      <div className="page-head">
        <div>
          <h1 className="mono">{t.transferNo}</h1>
          <p className="subtitle">
            <StatusBadge t={t} /> &nbsp;for job order <Link href={`/job-orders/${t.jobOrderNo}`}>{t.jobOrderNo}</Link>
          </p>
        </div>
        <div className="actions no-print">
          <Link href={`/transfers/${t.id}/slip`} className="btn secondary">
            Print transfer slip
          </Link>
        </div>
      </div>

      <div className={`banner ${banner.cls}`}>
        <strong>{banner.title}</strong>
        {banner.text}
      </div>

      <TransferActions
        transfer={{ id: t.id, status: t.status, fromPlantCode: t.fromPlantCode, toPlantCode: t.toPlantCode, resolved: !!t.resolvedAt }}
        actorPlant={actor?.plantCode ?? null}
        fromName={name(t.fromPlantCode)}
        toName={name(t.toPlantCode)}
      />

      <div className="grid-2">
        <div className="card">
          <h2>Route</h2>
          <div className="route" style={{ marginBottom: 14 }}>
            <div className="plant">
              <small>From</small>
              <strong>{name(t.fromPlantCode)}</strong> <span className="muted small">({t.fromPlantCode})</span>
            </div>
            <div className="arrow">→</div>
            <div className="plant">
              <small>To</small>
              <strong>{name(t.toPlantCode)}</strong> <span className="muted small">({t.toPlantCode})</span>
            </div>
          </div>
          <dl className="facts">
            <dt>Sent by</dt>
            <dd>
              {t.sentBy} · {fmtDateTime(t.sentAt)}
            </dd>
            <dt>Vehicle / trolley</dt>
            <dd>{t.vehicleRef ?? "—"}</dd>
            <dt>Sender remarks</dt>
            <dd>{t.sendRemarks ?? "—"}</dd>
            <dt>Received by</dt>
            <dd>{t.receivedBy ? `${t.receivedBy} · ${fmtDateTime(t.receivedAt)}` : "— not yet —"}</dd>
            <dt>Receiver remarks</dt>
            <dd>{t.receiveRemarks ?? "—"}</dd>
          </dl>
        </div>

        <div className="card">
          <h2>SAP stock postings</h2>
          <p className="small muted">
            Mirrors SAP&apos;s two-step plant-to-plant transfer: <b>303</b> takes stock out of the sending plant into
            &quot;in transit&quot;, <b>305</b> books it into the receiving plant. Queued here, delivered by the sync job.
          </p>
          {outbox.length === 0 ? (
            <div className="empty">No postings.</div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Movement</th>
                  <th>Status</th>
                  <th>SAP document</th>
                </tr>
              </thead>
              <tbody>
                {outbox.map((o) => (
                  <tr key={o.id}>
                    <td className="small">{o.eventType.replace("SAP_", "").replaceAll("_", " ").toLowerCase()}</td>
                    <td>
                      <span className={`badge ${o.status}`}>{o.status === "PENDING" ? "Queued" : o.status === "SENT" ? "Posted" : "Failed"}</span>
                    </td>
                    <td className="mono small">{o.externalRef ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="small" style={{ marginTop: 8 }}>
            <Link href="/integration">Open SAP sync →</Link>
          </p>
        </div>
      </div>

      <div className="card">
        <h2>Parts: sent vs. counted on arrival</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Part</th>
                <th className="num">Sent</th>
                <th className="num">Counted (usable)</th>
                <th className="num">Difference</th>
                <th>Reason / note</th>
              </tr>
            </thead>
            <tbody>
              {t.lines.map((l) => {
                const diff = l.qtyReceived == null ? null : l.qtyReceived - l.qtySent;
                return (
                  <tr key={l.id}>
                    <td>
                      <strong className="mono">{l.materialNumber}</strong> <span className="small">{l.material.description}</span>
                      <div className="small muted">{DEPARTMENTS[l.material.department]} dept. · unit {l.material.unit}</div>
                    </td>
                    <td className="num">{l.qtySent}</td>
                    <td className="num">{l.qtyReceived ?? <span className="muted">—</span>}</td>
                    <td className={`num ${diff ? (diff < 0 ? "red" : "amber") : diff === 0 ? "green" : ""}`}>
                      {diff == null ? "—" : diff === 0 ? "✓ 0" : diff > 0 ? `+${diff}` : diff}
                    </td>
                    <td className="small">
                      {l.discrepancyReason ? DISCREPANCY_REASONS[l.discrepancyReason]?.split(" — ")[0] : ""}
                      {l.discrepancyNote && <div className="muted">“{l.discrepancyNote}”</div>}
                    </td>
                  </tr>
                );
              })}
              <tr>
                <td>
                  <strong>Total</strong>
                </td>
                <td className="num">
                  <strong>{sentTotal}</strong>
                </td>
                <td className="num">
                  <strong>{t.receivedAt ? gotTotal : "—"}</strong>
                </td>
                <td className="num">{t.receivedAt ? gotTotal - sentTotal : "—"}</td>
                <td></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <h2>Audit trail</h2>
          <span className="small muted">Append-only — the database rejects any edit or deletion of these entries.</span>
        </div>
        <ul className="timeline">
          {t.events.map((e) => (
            <li key={e.id} className={e.type}>
              <div className="when">
                {fmtDateTime(e.createdAt)} (Dubai time) · event #{e.id}
              </div>
              <div className="what">{EVENT_LABELS[e.type] ?? e.type}</div>
              <div>{e.message}</div>
              <div className="small muted">
                by <strong>{e.actor}</strong> acting for {name(e.plantCode)}
              </div>
              <details>
                <summary>Record exactly as it was at this moment</summary>
                <pre>{JSON.stringify(e.snapshot, null, 2)}</pre>
              </details>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}
