import Link from "next/link";
import { prisma } from "@/lib/db";
import { getPlantMap } from "@/lib/plants";
import { fmtDateTime } from "@/lib/format";
import { EVENT_LABELS } from "@/lib/constants";

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ plant?: string; type?: string }> }) {
  const sp = await searchParams;
  const { plants, name } = await getPlantMap();
  const events = await prisma.transferEvent.findMany({
    where: { plantCode: sp.plant || undefined, type: sp.type || undefined },
    include: { transfer: { select: { id: true, transferNo: true, jobOrderNo: true } } },
    orderBy: { id: "desc" },
    take: 300,
  });

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Audit trail</h1>
          <p className="subtitle">
            Every action on every transfer, newest first. Entries can only be added — the database itself rejects edits and
            deletions.
          </p>
        </div>
        <a href="/api/export/audit" className="btn secondary">
          Download CSV (Excel)
        </a>
      </div>

      <div className="card">
        <form className="filters" action="/audit">
          <div>
            <label>Acting plant</label>
            <select name="plant" defaultValue={sp.plant ?? ""}>
              <option value="">Any</option>
              {plants.map((p) => (
                <option key={p.code} value={p.code}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label>Event</label>
            <select name="type" defaultValue={sp.type ?? ""}>
              <option value="">Any</option>
              {Object.entries(EVENT_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          <button className="btn">Apply</button>
        </form>
      </div>

      <div className="card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>When (Dubai)</th>
                <th>Transfer</th>
                <th>Event</th>
                <th>Who</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {events.length === 0 && (
                <tr>
                  <td colSpan={6} className="empty">
                    No events match.
                  </td>
                </tr>
              )}
              {events.map((e) => (
                <tr key={e.id}>
                  <td className="muted">{e.id}</td>
                  <td className="nowrap small">{fmtDateTime(e.createdAt)}</td>
                  <td>
                    <Link href={`/transfers/${e.transfer.id}`} className="mono">
                      {e.transfer.transferNo}
                    </Link>
                    <div className="small muted">{e.transfer.jobOrderNo}</div>
                  </td>
                  <td className="nowrap">{EVENT_LABELS[e.type] ?? e.type}</td>
                  <td className="small">
                    <strong>{e.actor}</strong>
                    <div className="muted">{name(e.plantCode)}</div>
                  </td>
                  <td className="small">{e.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
