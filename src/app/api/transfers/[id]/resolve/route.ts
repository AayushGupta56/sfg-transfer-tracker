import { handle } from "@/lib/api";
import { requireActor } from "@/lib/session";
import { resolveDiscrepancy } from "@/lib/transfers";

// POST /api/transfers/:id/resolve { note }
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const actor = await requireActor();
    const { id } = await params;
    const { note } = await req.json();
    await resolveDiscrepancy(actor, Number(id), note);
  });
}
