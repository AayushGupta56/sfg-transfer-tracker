"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DISCREPANCY_REASONS } from "@/lib/constants";

type Line = { materialNumber: string; description: string; unit: string; qtySent: number };
type Entry = { qty: string; reason: string; note: string };

export function ReceiveForm({ transferId, actorName, lines }: { transferId: number; actorName: string; lines: Line[] }) {
  const router = useRouter();
  // Counted quantities start EMPTY on purpose: the receiver must physically count, not just click "OK".
  const [entries, setEntries] = useState<Record<string, Entry>>(
    Object.fromEntries(lines.map((l) => [l.materialNumber, { qty: "", reason: "", note: "" }])),
  );
  const [remarks, setRemarks] = useState("");
  const [counted, setCounted] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const set = (m: string, patch: Partial<Entry>) => setEntries({ ...entries, [m]: { ...entries[m], ...patch } });

  const rows = lines.map((l) => {
    const e = entries[l.materialNumber];
    const filled = e.qty !== "";
    const n = Number(e.qty);
    const valid = filled && Number.isInteger(n) && n >= 0;
    const diff = valid ? n - l.qtySent : null;
    const needsReason = diff !== null && diff !== 0;
    return { l, e, filled, valid, diff, needsReason, missingReason: needsReason && !e.reason };
  });

  const allCounted = rows.every((r) => r.valid);
  const discrepancies = rows.filter((r) => (r.diff ?? 0) !== 0 || r.e.reason);
  const ready = allCounted && rows.every((r) => !r.missingReason) && counted;

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    setError("");
    if (!allCounted) return setError("Enter the counted quantity for every part (0 if none arrived).");
    if (rows.some((r) => r.missingReason)) return setError("Select a reason for every line where the count differs.");
    if (!counted) return setError("Tick the box to confirm you physically counted the parts.");
    setBusy(true);
    const res = await fetch(`/api/transfers/${transferId}/receive`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        remarks,
        lines: rows.map((r) => ({
          materialNumber: r.l.materialNumber,
          qtyReceived: Number(r.e.qty),
          reason: r.e.reason || undefined,
          note: r.e.note || undefined,
        })),
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setBusy(false);
      return setError(data.error);
    }
    router.push(`/transfers/${transferId}?received=1`);
    router.refresh();
  }

  return (
    <form onSubmit={submit}>
      <div className="card">
        <h2>Count what physically arrived</h2>
        <p className="small muted">
          Enter the number of <strong>good, usable</strong> parts for each line. The sent quantity is shown for reference.
          If a count differs, or parts are damaged or wrong, choose a reason — this becomes a discrepancy both plants can
          see.
        </p>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Part</th>
                <th className="num">Sent</th>
                <th className="num">Counted (usable)</th>
                <th className="num">Difference</th>
                <th style={{ minWidth: 260 }}>Reason (needed if different)</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ l, e, filled, valid, diff, needsReason, missingReason }) => (
                <tr key={l.materialNumber}>
                  <td>
                    <strong className="mono">{l.materialNumber}</strong>
                    <div className="small">{l.description}</div>
                  </td>
                  <td className="num">
                    {l.qtySent} <span className="muted small">{l.unit}</span>
                  </td>
                  <td className="num">
                    <input
                      className={`qty ${filled && !valid ? "invalid" : ""}`}
                      type="number"
                      min={0}
                      step={1}
                      inputMode="numeric"
                      value={e.qty}
                      placeholder="count"
                      onChange={(ev) => {
                        const v = ev.target.value;
                        const d = v === "" ? 0 : Number(v) - l.qtySent;
                        // Suggest the obvious reason; the receiver can change it.
                        const reason = !e.reason || e.reason === "SHORT" || e.reason === "EXCESS" ? (d < 0 ? "SHORT" : d > 0 ? "EXCESS" : "") : e.reason;
                        set(l.materialNumber, { qty: v, reason });
                      }}
                    />
                  </td>
                  <td className={`num ${diff ? (diff < 0 ? "red" : "amber") : diff === 0 ? "green" : ""}`}>
                    {diff == null ? "—" : diff === 0 ? "✓ matches" : diff > 0 ? `+${diff}` : diff}
                  </td>
                  <td>
                    <select
                      className={missingReason ? "invalid" : ""}
                      value={e.reason}
                      onChange={(ev) => set(l.materialNumber, { reason: ev.target.value })}
                    >
                      <option value="">{needsReason ? "— choose a reason —" : "No issue"}</option>
                      {Object.entries(DISCREPANCY_REASONS).map(([k, v]) => (
                        <option key={k} value={k}>
                          {v}
                        </option>
                      ))}
                    </select>
                    {e.reason && (
                      <input
                        type="text"
                        style={{ marginTop: 6 }}
                        placeholder={e.reason === "OTHER" ? "Explain (required)" : "Note (optional), e.g. 2 bent at corner"}
                        value={e.note}
                        onChange={(ev) => set(l.materialNumber, { note: ev.target.value })}
                      />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <div className="field">
          <label htmlFor="rem">
            Remarks <span className="hint">(optional)</span>
          </label>
          <input id="rem" type="text" value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="e.g. arrived 30 min late, informed sender by phone" />
        </div>

        {allCounted && (
          <div className={`alert ${discrepancies.length ? "warn" : "success"}`}>
            {discrepancies.length
              ? `This will be recorded as RECEIVED WITH DISCREPANCY on ${discrepancies.length} line(s). The sending plant will see it on their dashboard.`
              : "All counts match the slip. This will be recorded as RECEIVED."}
          </div>
        )}

        <label className="check" style={{ marginBottom: 12 }}>
          <input type="checkbox" checked={counted} onChange={(e) => setCounted(e.target.checked)} />
          <span>
            I, <strong>{actorName}</strong>, physically counted these parts. This confirmation is permanent and will be
            signed with my name and the current time.
          </span>
        </label>

        {error && <div className="alert error">{error}</div>}
        <div className="actions">
          <button className="btn success" disabled={busy || !ready}>
            {busy ? "Saving…" : "Confirm receipt"}
          </button>
          <a href={`/transfers/${transferId}`} className="btn secondary">
            Cancel
          </a>
        </div>
      </div>
    </form>
  );
}
