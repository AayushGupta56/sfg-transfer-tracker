import { prisma } from "@/lib/db";
import { handle } from "@/lib/api";
import { DomainError } from "@/lib/transfers";

// GET /api/transfers/:id — full record incl. lines, audit trail and SAP outbox
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await params;
    const t = await prisma.transfer.findUnique({
      where: { id: Number(id) },
      include: { lines: { include: { material: true } }, events: { orderBy: { id: "asc" } } },
    });
    if (!t) throw new DomainError("Transfer not found", 404);
    const outbox = await prisma.outboxEvent.findMany({ where: { transferId: t.id }, orderBy: { id: "asc" } });
    return { ...t, outbox };
  });
}
