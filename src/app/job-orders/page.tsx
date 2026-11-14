import Link from "next/link";
import { jobOrders, getJobOrderProgress } from "@/lib/jobOrders";
import { getPlantMap } from "@/lib/plants";

export default async function JobOrdersPage() {
  const { name } = await getPlantMap();
  const list = await jobOrders.list();
  const rows = await Promise.all(list.map(async (j) => ({ j, p: await getJobOrderProgress(j) })));

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Job orders</h1>
          <p className="subtitle">
            Parent builds, read from the job order system (<code>data/job_orders.json</code> in this prototype). For each
            one: have all its SFGs physically reached the assembly plant?
          </p>
        </div>
      </div>
      <div className="card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Job order</th>
                <th>Product</th>
                <th className="num">Qty</th>
                <th>Assembled at</th>
                <th>Due</th>
                <th>Status</th>
                <th>SFGs at assembly plant</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ j, p }) => (
                <tr key={j.jobOrderNo}>
                  <td>
                    <Link href={`/job-orders/${j.jobOrderNo}`}>
                      <strong>{j.jobOrderNo}</strong>
                    </Link>
                  </td>
                  <td>
                    {j.product.description}
                    <div className="small muted mono">{j.product.number}</div>
                  </td>
                  <td className="num">{j.quantity}</td>
                  <td>{name(j.assemblyPlant)}</td>
                  <td className="nowrap">{j.dueDate}</td>
                  <td>
                    <span className={`badge ${j.status === "RELEASED" ? "IN_TRANSIT" : "neutral"}`}>{j.status}</span>
                  </td>
                  <td>
                    {p.readyToBuild ? (
                      <span className="badge RECEIVED">All {p.components.length} received — ready to build</span>
                    ) : (
                      <span className="small">
                        <strong>
                          {p.completeCount} / {p.components.length}
                        </strong>{" "}
                        components complete
                      </span>
                    )}
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
