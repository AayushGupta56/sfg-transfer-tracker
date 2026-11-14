"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Plant = { code: string; name: string; description: string };

export function WhoAmIForm({ plants, current, next }: { plants: Plant[]; current?: { name: string; plantCode: string } | null; next?: string }) {
  const router = useRouter();
  const [name, setName] = useState(current?.name ?? "");
  const [plantCode, setPlantCode] = useState(current?.plantCode ?? "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const res = await fetch("/api/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, plantCode }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) return setError(data.error);
    router.push(next || "/");
    router.refresh();
  }

  return (
    <form onSubmit={submit}>
      {error && <div className="alert error">{error}</div>}
      <div className="field">
        <label htmlFor="name">Your name</label>
        <input id="name" type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Ravi Kumar" autoFocus />
      </div>
      <div className="field">
        <label>Which plant are you working at?</label>
        {plants.map((p) => (
          <label key={p.code} className="check" style={{ marginBottom: 6 }}>
            <input type="radio" name="plant" value={p.code} checked={plantCode === p.code} onChange={() => setPlantCode(p.code)} />
            <span>
              <strong>{p.name}</strong> <span className="muted">({p.code})</span>
              <br />
              <span className="hint">{p.description}</span>
            </span>
          </label>
        ))}
      </div>
      <button className="btn" disabled={busy}>
        {busy ? "Saving…" : "Continue"}
      </button>
    </form>
  );
}
