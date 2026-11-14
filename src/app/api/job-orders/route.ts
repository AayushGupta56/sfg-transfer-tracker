import { handle } from "@/lib/api";
import { jobOrders } from "@/lib/jobOrders";

// GET /api/job-orders — job orders as read from the job order system (dummy file today)
export async function GET() {
  return handle(() => jobOrders.list());
}
