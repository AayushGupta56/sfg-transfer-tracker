import { prisma } from "@/lib/db";

// GET /api/export/audit — full audit trail as CSV (opens in Excel)
export async function GET() {
  const events = await prisma.transferEvent.findMany({
    include: { transfer: { select: { transferNo: true, fromPlantCode: true, toPlantCode: true, jobOrderNo: true } } },
    orderBy: { id: "asc" },
  });
  const esc = (v: unknown) => `"${String(v ?? "").replaceAll('"', '""')}"`;
  const rows = [
    ["event_id", "timestamp_utc", "transfer_no", "job_order", "from_plant", "to_plant", "event", "actor", "acting_plant", "details"],
    ...events.map((e) => [
      e.id,
      e.createdAt.toISOString(),
      e.transfer.transferNo,
      e.transfer.jobOrderNo,
      e.transfer.fromPlantCode,
      e.transfer.toPlantCode,
      e.type,
      e.actor,
      e.plantCode,
      e.message,
    ]),
  ];
  return new Response(rows.map((r) => r.map(esc).join(",")).join("\r\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="sfg-audit-trail-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
