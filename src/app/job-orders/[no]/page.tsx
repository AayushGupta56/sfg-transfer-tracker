import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { jobOrders, getJobOrderProgress } from "@/lib/jobOrders";
import { getPlantMap } from "@/lib/plants";
import { DEPARTMENTS } from "@/lib/constants";
import { TransferTable } from "@/components/TransferTable";

export default async function JobOrderPage({ params }: { params: Promise<{ no: string }> }) {
  const { no } = await params;
  const jo = await jobOrders.get(no);
  if (!jo) notFound();
  const { name } = await getPlantMap();
  const progress = await getJobOrderProgress(jo);
  const transfers = await prisma.transfer.findMany({
    where: { jobOrderNo: jo.jobOrderNo },
    include: { lines: true },
    orderBy: { id: "desc" },
  });

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{jo.jobOrderNo}</h1>
          <p className="subtitle">
            {jo.product.description} ({jo.product.number}) × {jo.quantity} · assembled at{" "}
            <strong>{name(jo.assemblyPlant)}</strong> · due {jo.dueDate} ·{" "}
            <span className={`badge ${jo.status === "RELEASED" ? "IN_TRANSIT" : "neutral"}`}>{jo.status}</span>
          </p>
        </div>
        {jo.status === "RELEASED" && (
          <Link href={`/transfers/new?jo=${jo.jobOrderNo}`} className="btn">
            + Send parts for this job
          </Link>
        )}
      </div>

      <div className={`banner ${progress.readyToBuild ? "RECEIVED" : "IN_TRANSIT"}`}>
        <strong>
          {progress.readyToBuild
            ? "All SFGs have reached the assembly plant — ready to build"
            : `${progress.completeCount} of ${progress.components.length} components fully received at ${name(jo.assemblyPlant)}`}
        </strong>
        Only parts counted and confirmed at {name(jo.assemblyPlant)} count as received. This same data is available to the
        job order system at <code>/api/job-orders/{jo.jobOrderNo}</code>.
      </div>

      <div className="card">
        <h2>SFG status for this build</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Part</th>
                <th>Made at</th>
                <th className="num">Per unit</th>
                <th className="num">Needed</th>
                <th className="num">Received</th>
                <th className="num">On the way</th>
                <th className="num">Not yet sent</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {progress.components.map((c) => (
                <tr key={c.materialNumber}>
                  <td>
                    <strong className="mono">{c.materialNumber}</strong> <span className="small">{c.description}</span>
                    <div className="small muted">{DEPARTMENTS[c.department] ?? c.department} dept.</div>
                  </td>
                  <td>{name(c.producedAt)}</td>
                  <td className="num">{c.qtyPerUnit}</td>
                  <td className="num">{c.required}</td>
                  <td className="num">
                    <strong>{c.received}</strong>
                  </td>
                  <td className="num">{c.inTransit}</td>
                  <td className={`num ${c.outstanding > 0 ? "red" : ""}`}>{c.outstanding}</td>
                  <td>
                    {c.complete ? (
                      <span className="badge RECEIVED">Complete</span>
                    ) : c.inTransit > 0 && c.outstanding === 0 ? (
                      <span className="badge IN_TRANSIT">Arriving</span>
                    ) : (
                      <span className="badge RECEIVED_WITH_DISCREPANCY">Short {c.required - c.received}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <h2>Transfers for {jo.jobOrderNo}</h2>
        <TransferTable rows={transfers} plantName={name} empty="No SFGs have been sent for this job order yet." />
      </div>
    </>
  );
}
