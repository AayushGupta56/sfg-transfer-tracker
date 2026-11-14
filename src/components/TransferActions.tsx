"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";

type Props = {
  transfer: { id: number; status: string; fromPlantCode: string; toPlantCode: string; resolved: boolean };
  actorPlant: string | null;
  fromName: string;
  toName: string;
};

/** Shows only the actions the current person is allowed to take — and says why when there are none. */
export function TransferActions({ transfer: t, actorPlant, fromName, toName }: Props) {
  const router = useRouter();
  const [mode, setMode] = useState<"" | "cancel" | "resolve">("");
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const isReceiver = actorPlant === t.toPlantCode;
  const isSender = actorPlant === t.fromPlantCode;

  async function submit() {
    setBusy(true);
    setError("");
    const res = await fetch(`/api/transfers/${t.id}/${mode}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(mode === "cancel" ? { reason: text } : { note: text }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) return setError(data.error);
    setMode("");
    setText("");
    router.refresh();
  }

  let content: React.ReactNode = null;

  if (!actorPlant) {
    content = (
      <span>
        <Link href="/whoami">Choose who you are</Link> to act on this transfer.
      </span>
    );
  } else if (t.status === "IN_TRANSIT") {
    content = (
      <>
        {isReceiver && (
          <Link href={`/transfers/${t.id}/receive`} className="btn success">
            Count &amp; confirm receipt
          </Link>
        )}
        {isSender && (
          <button className="btn danger" onClick={() => setMode("cancel")}>
            Cancel this transfer
          </button>
        )}
        {!isReceiver && !isSender && (
          <span className="muted">
            Only {toName} can confirm receipt; only {fromName} can cancel.
          </span>
        )}
        {isSender && <span className="small muted">Only {toName} can confirm receipt.</span>}
      </>
    );
  } else if (t.status === "RECEIVED_WITH_DISCREPANCY" && !t.resolved) {
    content =
      isReceiver || isSender ? (
        <button className="btn" onClick={() => setMode("resolve")}>
          Close discrepancy with a note
        </button>
      ) : (
        <span className="muted">
          Only {fromName} or {toName} can close this discrepancy.
        </span>
      );
  }

  if (!content) return null;

  return (
    <div className="card no-print">
      <div className="actions">{content}</div>
      {mode && (
        <div style={{ marginTop: 14 }}>
          <label>
            {mode === "cancel"
              ? "Why are you cancelling? (e.g. wrong parts loaded, truck didn't leave)"
              : "How was it resolved? (e.g. 2 panels found at Plant 2 and re-sent on TRF-000010)"}
          </label>
          <textarea value={text} onChange={(e) => setText(e.target.value)} autoFocus />
          {error && <div className="alert error" style={{ marginTop: 8 }}>{error}</div>}
          <div className="actions" style={{ marginTop: 8 }}>
            <button className={`btn ${mode === "cancel" ? "danger" : ""}`} disabled={busy || !text.trim()} onClick={submit}>
              {busy ? "Saving…" : mode === "cancel" ? "Confirm cancellation" : "Close discrepancy"}
            </button>
            <button className="btn secondary" onClick={() => setMode("")}>
              Back
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
