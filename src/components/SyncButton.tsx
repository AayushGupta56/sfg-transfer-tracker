"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function SyncButton({ pending }: { pending: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function run() {
    setBusy(true);
    const res = await fetch("/api/integration/sync", { method: "POST" });
    const d = await res.json();
    setBusy(false);
    setMsg(res.ok ? `Posted ${d.sent}, failed ${d.failed}` : d.error);
    router.refresh();
  }

  return (
    <div className="actions">
      {msg && <span className="small muted">{msg}</span>}
      <button className="btn" onClick={run} disabled={busy || pending === 0}>
        {busy ? "Syncing…" : pending ? `Run SAP sync now (${pending})` : "Nothing to sync"}
      </button>
    </div>
  );
}
