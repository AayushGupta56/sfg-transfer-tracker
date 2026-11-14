// Boundary to the existing Job Order System (owner of the parent build).
//
// The tracker never owns job orders — it only reads them and reports SFG progress back.
// Today the source is a JSON file; swapping in the real system means writing one new class
// that implements JobOrderProvider (e.g. ApiJobOrderProvider calling REST, or an SAP
// production-order provider) and changing the export at the bottom of this file.

import data from "../../data/job_orders.json";
import { prisma } from "./db";

export type JobOrderComponent = {
  materialNumber: string;
  qtyPerUnit: number;
  producedAt: string; // plant code where this SFG is made
};

export type JobOrder = {
  jobOrderNo: string;
  product: { number: string; description: string };
  quantity: number;
  assemblyPlant: string; // plant where the parent product is built — where SFGs must end up
  dueDate: string;
  status: "RELEASED" | "CLOSED" | string;
  components: JobOrderComponent[];
};

export interface JobOrderProvider {
  list(): Promise<JobOrder[]>;
  get(jobOrderNo: string): Promise<JobOrder | null>;
}

class FileJobOrderProvider implements JobOrderProvider {
  async list() {
    return data.jobOrders as JobOrder[];
  }
  async get(jobOrderNo: string) {
    return (data.jobOrders as JobOrder[]).find((j) => j.jobOrderNo === jobOrderNo) ?? null;
  }
}

export const jobOrders: JobOrderProvider = new FileJobOrderProvider();

// ---------------------------------------------------------------------------
// The other direction: what the tracker tells the job order system.
// For each SFG of a job order, how many must reach the assembly plant, and how many have.
// Exposed at GET /api/job-orders/:no so the job order system can poll it.
// ---------------------------------------------------------------------------

export type ComponentProgress = JobOrderComponent & {
  description: string;
  department: string;
  required: number;
  inTransit: number;
  received: number;
  outstanding: number; // still to be sent
  complete: boolean;
};

export async function getJobOrderProgress(jo: JobOrder) {
  const lines = await prisma.transferLine.findMany({
    where: {
      transfer: {
        jobOrderNo: jo.jobOrderNo,
        toPlantCode: jo.assemblyPlant,
        status: { not: "CANCELLED" },
      },
    },
    include: { transfer: { select: { status: true } }, material: true },
  });
  const materials = await prisma.material.findMany({
    where: { number: { in: jo.components.map((c) => c.materialNumber) } },
  });

  const components: ComponentProgress[] = jo.components.map((c) => {
    const mine = lines.filter((l) => l.materialNumber === c.materialNumber);
    const inTransit = mine
      .filter((l) => l.transfer.status === "IN_TRANSIT")
      .reduce((s, l) => s + l.qtySent, 0);
    const received = mine
      .filter((l) => l.transfer.status !== "IN_TRANSIT")
      .reduce((s, l) => s + (l.qtyReceived ?? 0), 0);
    const required = c.qtyPerUnit * jo.quantity;
    const m = materials.find((x) => x.number === c.materialNumber);
    return {
      ...c,
      description: m?.description ?? "(unknown material)",
      department: m?.department ?? "",
      required,
      inTransit,
      received,
      outstanding: Math.max(0, required - received - inTransit),
      complete: received >= required,
    };
  });

  return {
    components,
    readyToBuild: components.every((c) => c.complete),
    completeCount: components.filter((c) => c.complete).length,
  };
}
