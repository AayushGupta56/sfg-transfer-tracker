import { handle } from "@/lib/api";
import { requireActor } from "@/lib/session";
import { receiveTransfer } from "@/lib/transfers";

// POST /api/transfers/:id/receive — CONFIRM RECEIPT with counted quantities
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const actor = await requireActor();
    const { id } = await params;
    return receiveTransfer(actor, Number(id), await req.json());
  });
}
