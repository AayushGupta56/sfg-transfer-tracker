"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { DEPARTMENTS } from "@/lib/constants";
import type { ComponentProgress, JobOrder } from "@/lib/jobOrders";

type Plant = { code: string; name: string; description: string };
type JO = JobOrder & { progress: ComponentProgress[] };

export function SendForm({
  actor,
  plants,
  jobOrders,
  initialJo,
}: {
  actor: { name: string; plantCode: string };
  plants: Plant[];
  jobOrders: JO[];
  initialJo?: string;
}) {
  const router = useRouter();
  const plantName = (c: string) => plants.find((p) => p.code === c)?.name ?? c;

  const startJo = jobOrders.find((j) => j.jobOrderNo === initialJo);
  const [joNo, setJoNo] = useState(startJo?.jobOrderNo ?? "");
  const [toPlant, setToPlant] = useState(
    startJo && startJo.assemblyPlant !== actor.plantCode ? startJo.assemblyPlant : "",
  );
  const [qty, setQty] = useState<Record<string, string>>({});
  const [vehicleRef, setVehicleRef] = useState("");
  const [remarks, setRemarks] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  // One key per form: a double-click or network retry can never create a duplicate transfer.
  const [idempotencyKey] = useState(() => crypto.randomUUID());

  const jo = jobOrders.find((j) => j.jobOrderNo === joNo);

  // Parts made at the sender's plant first — those are the ones they normally send.
  const rows = useMemo(
    () =>
      jo
        ? [...jo.progress].sort(
            (a, b) => Number(b.producedAt === actor.plantCode) - Number(a.producedAt === actor.plantCode),
          )
        : [],
    [jo, actor.plantCode],
  );

  const lines = rows
    .map((r) => ({ materialNumber: r.materialNumber, qty: Number(qty[r.materialNumber] || 0) }))
    .filter((l) => l.qty > 0);
  const total = lines.reduce((s, l) => s + l.qty, 0);

  function chooseJo(no: string) {
    setJoNo(no);
    setQty({});
    const j = jobOrders.find((x) => x.jobOrderNo === no);
    if (j && j.assemblyPlant !== actor.plantCode) setToPlant(j.assemblyPlant);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!jo) return setError("Choose the job order these parts are for");
    if (!toPlant) return setError("Choose the plant you are sending to");
    if (lines.length === 0) return setError("Enter a quantity for at least one part");
    setBusy(true);
    const res = await fetch("/api/transfers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ toPlantCode: toPlant, jobOrderNo: joNo, lines, vehicleRef, remarks, idempotencyKey }),
    });
    const data = await res.json();
    if (!res.ok) {
      setBusy(false);
      return setError(data.error);
    }
    router.push(`/transfers/${data.id}?created=1`);
    router.refresh();
  }

  return (
    <form onSubmit={submit}>
      <div className="card">
        <h2>1 · Which job order are these parts for?</h2>
        <div className="field">
          <select value={joNo} onChange={(e) => chooseJo(e.target.value)}>
            <option value="">— Select a released job order —</option>
            {jobOrders.map((j) => (
              <option key={j.jobOrderNo} value={j.jobOrderNo}>
                {j.jobOrderNo} — {j.product.description} × {j.quantity} — built at {plantName(j.assemblyPlant)}, due{" "}
                {j.dueDate}
              </option>
            ))}
          </select>
          <div className="hint">
            Job orders come from the job order system. Only RELEASED job orders accept SFG transfers.
          </div>
        </div>
      </div>

      {jo && (
        <>
          <div className="card">
            <h2>2 · Where are they going?</h2>
            <div className="route" style={{ marginBottom: 12 }}>
              <div className="plant">
                <small>From (your plant)</small>
                <strong>{plantName(actor.plantCode)}</strong>
              </div>
              <div className="arrow">→</div>
              <div className="plant" style={{ minWidth: 240 }}>
                <small>To</small>
                <select value={toPlant} onChange={(e) => setToPlant(e.target.value)}>
                  <option value="">— Choose plant —</option>
                  {plants
                    .filter((p) => p.code !== actor.plantCode)
                    .map((p) => (
                      <option key={p.code} value={p.code}>
                        {p.name} — {p.description}
                      </option>
                    ))}
                </select>
              </div>
            </div>
            {toPlant && toPlant !== jo.assemblyPlant && (
              <div className="alert warn">
                {jo.jobOrderNo} is assembled at <strong>{plantName(jo.assemblyPlant)}</strong>. Parts sent to{" "}
                {plantName(toPlant)} will be tracked, but won&apos;t count toward this job order&apos;s readiness until they
                reach {plantName(jo.assemblyPlant)}.
              </div>
            )}
          </div>

          <div className="card">
            <h2>3 · What are you sending?</h2>
            <p className="small muted">
              Only components of {jo.jobOrderNo} can be sent against it. &quot;Still to send&quot; = needed for the job −
              already received − already on the way.
            </p>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Part</th>
                    <th>Made at</th>
                    <th className="num">Needed for job</th>
                    <th className="num">Received</th>
                    <th className="num">On the way</th>
                    <th className="num">Still to send</th>
                    <th className="num">Qty sending now</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const v = qty[r.materialNumber] ?? "";
                    const n = Number(v || 0);
                    const bad = v !== "" && (!Number.isInteger(n) || n < 0);
                    const over = !bad && n > r.outstanding;
                    const ours = r.producedAt === actor.plantCode;
                    return (
                      <tr key={r.materialNumber} style={ours ? undefined : { opacity: 0.7 }}>
                        <td>
                          <strong className="mono">{r.materialNumber}</strong>
                          <div className="small">{r.description}</div>
                          <div className="small muted">{DEPARTMENTS[r.department] ?? r.department} dept.</div>
                        </td>
                        <td className="small">
                          {plantName(r.producedAt)}
                          {ours && <div className="green">your plant</div>}
                        </td>
                        <td className="num">{r.required}</td>
                        <td className="num">{r.received}</td>
                        <td className="num">{r.inTransit}</td>
                        <td className="num">
                          <strong>{r.outstanding}</strong>
                        </td>
                        <td className="num">
                          <input
                            className={`qty ${bad ? "invalid" : ""}`}
                            type="number"
                            min={0}
                            step={1}
                            inputMode="numeric"
                            value={v}
                            placeholder="0"
                            onChange={(e) => setQty({ ...qty, [r.materialNumber]: e.target.value })}
                          />
                          {over && <div className="small amber">More than still needed</div>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="card">
            <h2>4 · Shipment details</h2>
            <div className="form-row">
              <div className="field">
                <label htmlFor="veh">
                  Vehicle / trolley / driver <span className="hint">(optional)</span>
                </label>
                <input id="veh" type="text" value={vehicleRef} onChange={(e) => setVehicleRef(e.target.value)} placeholder="e.g. Truck DXB-4471, driver Imran" />
              </div>
              <div className="field">
                <label htmlFor="rem">
                  Remarks <span className="hint">(optional)</span>
                </label>
                <input id="rem" type="text" value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="e.g. 2 pallets, wrapped" />
              </div>
            </div>
          </div>
        </>
      )}

      <div className="card">
        {error && <div className="alert error">{error}</div>}
        <div className="actions" style={{ justifyContent: "space-between" }}>
          <div>
            {jo && toPlant && total > 0 ? (
              <>
                Sending <strong>{total} pcs</strong> ({lines.length} part type{lines.length > 1 ? "s" : ""}) from{" "}
                <strong>{plantName(actor.plantCode)}</strong> to <strong>{plantName(toPlant)}</strong> for{" "}
                <strong>{jo.jobOrderNo}</strong>, signed by {actor.name}.
              </>
            ) : (
              <span className="muted">Fill in the steps above.</span>
            )}
          </div>
          <button className="btn" disabled={busy}>
            {busy ? "Sending…" : "Send & create transfer slip"}
          </button>
        </div>
      </div>
    </form>
  );
}
