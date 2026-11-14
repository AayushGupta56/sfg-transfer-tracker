import { handle } from "@/lib/api";
import { jobOrders, getJobOrderProgress } from "@/lib/jobOrders";
import { DomainError } from "@/lib/transfers";

// GET /api/job-orders/:no — what the JOB ORDER SYSTEM calls to learn SFG progress for its build:
// per component: required, in transit, received at the assembly plant, outstanding.
export async function GET(_req: Request, { params }: { params: Promise<{ no: string }> }) {
  return handle(async () => {
    const { no } = await params;
    const jo = await jobOrders.get(no);
    if (!jo) throw new DomainError("Job order not found", 404);
    return { jobOrder: jo, ...(await getJobOrderProgress(jo)) };
  });
}
