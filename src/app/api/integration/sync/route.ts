import { handle } from "@/lib/api";
import { processOutbox } from "@/lib/sap";

// POST /api/integration/sync — deliver pending outbox events to SAP (mock adapter).
// In production this runs on a schedule (Vercel Cron / worker), not from a button.
export async function POST() {
  return handle(() => processOutbox());
}
