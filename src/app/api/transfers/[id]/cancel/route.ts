import { handle } from "@/lib/api";
import { requireActor } from "@/lib/session";
import { cancelTransfer } from "@/lib/transfers";

// POST /api/transfers/:id/cancel { reason }
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const actor = await requireActor();
    const { id } = await params;
    const { reason } = await req.json();
    await cancelTransfer(actor, Number(id), reason);
  });
}
