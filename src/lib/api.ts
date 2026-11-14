import { NextResponse } from "next/server";
import { DomainError } from "./transfers";

/** Wrap a route handler: business-rule errors become clean JSON with the right HTTP status. */
export async function handle(fn: () => Promise<unknown>) {
  try {
    const result = await fn();
    return NextResponse.json(result ?? { ok: true });
  } catch (e) {
    if (e instanceof DomainError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error(e);
    return NextResponse.json({ error: "Unexpected server error — please try again" }, { status: 500 });
  }
}
