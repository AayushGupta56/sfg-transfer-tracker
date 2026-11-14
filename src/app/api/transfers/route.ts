import { prisma } from "@/lib/db";
import { handle } from "@/lib/api";
import { requireActor } from "@/lib/session";
import { createTransfer } from "@/lib/transfers";
import type { TransferStatus } from "@prisma/client";

// GET /api/transfers?status=IN_TRANSIT&plant=1300&jobOrderNo=JO-26-0101
export async function GET(req: Request) {
  return handle(async () => {
    const q = new URL(req.url).searchParams;
    const plant = q.get("plant");
    return prisma.transfer.findMany({
      where: {
        status: (q.get("status") as TransferStatus) || undefined,
        jobOrderNo: q.get("jobOrderNo") || undefined,
        ...(plant ? { OR: [{ fromPlantCode: plant }, { toPlantCode: plant }] } : {}),
      },
      include: { lines: true },
      orderBy: { id: "desc" },
      take: 200,
    });
  });
}

// POST /api/transfers — log a SEND
export async function POST(req: Request) {
  return handle(async () => {
    const actor = await requireActor();
    const body = await req.json();
    const t = await createTransfer(actor, body);
    return { id: t.id, transferNo: t.transferNo };
  });
}
