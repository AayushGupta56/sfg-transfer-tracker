import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { getPlantMap } from "@/lib/plants";
import { fmtDateTime } from "@/lib/format";
import { PrintButton } from "@/components/PrintButton";

// Printable slip that travels with the parts. The receiver finds the transfer by its number.
export default async function SlipPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const t = await prisma.transfer.findUnique({
    where: { id: Number(id) || 0 },
    include: { lines: { include: { material: true }, orderBy: { id: "asc" } } },
  });
  if (!t) notFound();
  const { name } = await getPlantMap();

  return (
    <div style={{ maxWidth: 800 }}>
      <div className="actions no-print" style={{ marginBottom: 16 }}>
        <PrintButton />
        <Link href={`/transfers/${t.id}`} className="btn secondary">
          ← Back to transfer
        </Link>
      </div>
      <div className="card">
        <div className="card-head">
          <div>
            <div className="muted small">SFG INTER-PLANT TRANSFER SLIP</div>
            <div className="mono" style={{ fontSize: 34, fontWeight: 700 }}>
              {t.transferNo}
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div>
              Job order <strong>{t.jobOrderNo}</strong>
            </div>
            <div className="small">Sent {fmtDateTime(t.sentAt)}</div>
          </div>
        </div>
        <div className="route" style={{ margin: "12px 0 16px" }}>
          <div className="plant">
            <small>From</small>
            <strong>
              {name(t.fromPlantCode)} ({t.fromPlantCode})
            </strong>
          </div>
          <div className="arrow">→</div>
          <div className="plant">
            <small>To</small>
            <strong>
              {name(t.toPlantCode)} ({t.toPlantCode})
            </strong>
          </div>
        </div>
        <table>
          <thead>
            <tr>
              <th>Part no.</th>
              <th>Description</th>
              <th className="num">Qty sent</th>
              <th className="num">Qty counted</th>
            </tr>
          </thead>
          <tbody>
            {t.lines.map((l) => (
              <tr key={l.id}>
                <td className="mono">{l.materialNumber}</td>
                <td>{l.material.description}</td>
                <td className="num">
                  {l.qtySent} {l.material.unit}
                </td>
                <td className="num">________</td>
              </tr>
            ))}
          </tbody>
        </table>
        <dl className="facts" style={{ marginTop: 14 }}>
          <dt>Vehicle / trolley</dt>
          <dd>{t.vehicleRef ?? "—"}</dd>
          <dt>Remarks</dt>
          <dd>{t.sendRemarks ?? "—"}</dd>
        </dl>
        <div className="grid-2" style={{ marginTop: 28 }}>
          <div>
            Sent by: <strong>{t.sentBy}</strong>
            <br />
            <br />
            Signature: ____________________
          </div>
          <div>
            Received by: ____________________
            <br />
            <br />
            Signature: ____________________
          </div>
        </div>
        <p className="small muted" style={{ marginTop: 20 }}>
          Receiving plant: open <strong>SFG Transfer Tracker → Receive parts</strong>, enter <strong>{t.transferNo}</strong>,
          count the parts and confirm. Paper signatures are a backup; the system record is the official trail.
        </p>
      </div>
    </div>
  );
}
