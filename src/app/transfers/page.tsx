import Link from "next/link";
import type { Prisma, TransferStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getPlantMap } from "@/lib/plants";
import { overdueCutoff } from "@/lib/format";
import { STATUS_LABELS } from "@/lib/constants";
import { jobOrders } from "@/lib/jobOrders";
import { TransferTable } from "@/components/TransferTable";

type SP = { status?: string; from?: string; to?: string; jo?: string; q?: string; overdue?: string; open?: string };

export default async function TransfersPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const { plants, name } = await getPlantMap();
  const jos = await jobOrders.list();

  const where: Prisma.TransferWhereInput = {
    status: (sp.status as TransferStatus) || undefined,
    fromPlantCode: sp.from || undefined,
    toPlantCode: sp.to || undefined,
    jobOrderNo: sp.jo || undefined,
    ...(sp.overdue ? { sentAt: { lt: overdueCutoff() } } : {}),
    ...(sp.open ? { resolvedAt: null } : {}),
    ...(sp.q
      ? {
          OR: [
            { transferNo: { contains: sp.q.trim(), mode: "insensitive" } },
            { lines: { some: { materialNumber: { contains: sp.q.trim(), mode: "insensitive" } } } },
            { sentBy: { contains: sp.q.trim(), mode: "insensitive" } },
            { receivedBy: { contains: sp.q.trim(), mode: "insensitive" } },
          ],
        }
      : {}),
  };
  const rows = await prisma.transfer.findMany({ where, include: { lines: true }, orderBy: { id: "desc" }, take: 300 });
  const filtered = Object.values(sp).some(Boolean);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>All transfers</h1>
          <p className="subtitle">Search the full history: who sent what, where, when — and what was actually counted.</p>
        </div>
        <Link href="/transfers/new" className="btn">
          + Send parts
        </Link>
      </div>

      <div className="card">
        <form className="filters" action="/transfers">
          <div>
            <label>Status</label>
            <select name="status" defaultValue={sp.status ?? ""}>
              <option value="">Any</option>
              {Object.entries(STATUS_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label>From plant</label>
            <select name="from" defaultValue={sp.from ?? ""}>
              <option value="">Any</option>
              {plants.map((p) => (
                <option key={p.code} value={p.code}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label>To plant</label>
            <select name="to" defaultValue={sp.to ?? ""}>
              <option value="">Any</option>
              {plants.map((p) => (
                <option key={p.code} value={p.code}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label>Job order</label>
            <select name="jo" defaultValue={sp.jo ?? ""}>
              <option value="">Any</option>
              {jos.map((j) => (
                <option key={j.jobOrderNo} value={j.jobOrderNo}>
                  {j.jobOrderNo}
                </option>
              ))}
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <label>Search</label>
            <input type="search" name="q" defaultValue={sp.q} placeholder="Transfer no., part no. or person" />
          </div>
          <button className="btn">Apply</button>
          {filtered && (
            <Link href="/transfers" className="btn secondary">
              Clear
            </Link>
          )}
        </form>
        {(sp.overdue || sp.open) && (
          <p className="small muted" style={{ marginTop: 10, marginBottom: 0 }}>
            Showing only {sp.overdue ? "overdue" : "unresolved"} transfers.
          </p>
        )}
      </div>

      <div className="card">
        <div className="card-head">
          <h2>{rows.length} transfer{rows.length === 1 ? "" : "s"}</h2>
        </div>
        <TransferTable rows={rows} plantName={name} empty="No transfers match these filters." />
      </div>
    </>
  );
}
