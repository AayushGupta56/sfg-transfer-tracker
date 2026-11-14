import Link from "next/link";
import { prisma } from "@/lib/db";
import { fmtDateTime } from "@/lib/format";
import { SyncButton } from "@/components/SyncButton";

export default async function IntegrationPage() {
  const [events, counts] = await Promise.all([
    prisma.outboxEvent.findMany({ orderBy: { id: "desc" }, take: 100 }),
    prisma.outboxEvent.groupBy({ by: ["status"], _count: true }),
  ]);
  const transfers = await prisma.transfer.findMany({
    where: { id: { in: [...new Set(events.map((e) => e.transferId))] } },
    select: { id: true, transferNo: true },
  });
  const tNo = (id: number) => transfers.find((t) => t.id === id)?.transferNo ?? id;
  const count = (s: string) => counts.find((c) => c.status === s)?._count ?? 0;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>SAP integration (outbox)</h1>
          <p className="subtitle">
            Every send, receipt and cancellation queues an SAP stock posting here, in the same database transaction as the
            change itself. Nothing is lost if SAP is unavailable — it simply waits in the queue.
          </p>
        </div>
        <SyncButton pending={count("PENDING") + count("FAILED")} />
      </div>

      <div className="kpis">
        <div className="kpi amber">
          <div className="n">{count("PENDING")}</div>
          <div className="l">Queued</div>
          <div className="h">Waiting for the sync job</div>
        </div>
        <div className="kpi green">
          <div className="n">{count("SENT")}</div>
          <div className="l">Posted</div>
          <div className="h">Accepted by SAP (mock)</div>
        </div>
        <div className="kpi red">
          <div className="n">{count("FAILED")}</div>
          <div className="l">Failed</div>
          <div className="h">Retried automatically, up to 5 times</div>
        </div>
        <div className="kpi">
          <div className="n">303 → 305</div>
          <div className="l">SAP movement types</div>
          <div className="h">Two-step plant transfer (304 = reversal)</div>
        </div>
      </div>

      <div className="card">
        <h2>How it maps to SAP</h2>
        <div className="steps">
          <div className="step">
            <b>Send → 303</b>Stock leaves sending plant (WERKS) into &quot;stock in transit&quot; toward receiving plant (UMWRK).
          </div>
          <div className="step">
            <b>Receive → 305</b>Counted, usable quantity is booked into the receiving plant.
          </div>
          <div className="step">
            <b>Cancel → 304</b>Reverses the 303; stock returns to the sending plant.
          </div>
          <div className="step">
            <b>Prototype</b>A mock adapter returns a fake material document number. A real adapter would call S/4HANA&apos;s
            material-document API with the same payload.
          </div>
        </div>
      </div>

      <div className="card">
        <h2>Queue</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Transfer</th>
                <th>Posting</th>
                <th>Status</th>
                <th>SAP doc</th>
                <th>Queued</th>
                <th>Payload sent to SAP</th>
              </tr>
            </thead>
            <tbody>
              {events.map((e) => (
                <tr key={e.id}>
                  <td className="muted">{e.id}</td>
                  <td>
                    <Link href={`/transfers/${e.transferId}`} className="mono">
                      {tNo(e.transferId)}
                    </Link>
                  </td>
                  <td className="small nowrap">{e.eventType}</td>
                  <td>
                    <span className={`badge ${e.status}`}>{e.status}</span>
                    {e.lastError && <div className="small red">{e.lastError}</div>}
                  </td>
                  <td className="mono small">{e.externalRef ?? "—"}</td>
                  <td className="small nowrap">{fmtDateTime(e.createdAt)}</td>
                  <td>
                    <details>
                      <summary className="small">view</summary>
                      <pre style={{ fontSize: 11, maxWidth: 380, overflow: "auto" }}>{JSON.stringify(e.payload, null, 2)}</pre>
                    </details>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
