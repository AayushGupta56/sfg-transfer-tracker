// SAP boundary. Nothing in the app calls SAP directly — business actions only write
// OutboxEvent rows (see transfers.ts). processOutbox() delivers them through a SapAdapter.
//
// Today: MockSapAdapter pretends to post and returns a fake material document number.
// Later: ODataSapAdapter would POST to S/4HANA API_MATERIAL_DOCUMENT_SRV (or call
// BAPI_GOODSMVT_CREATE) with exactly the payload already stored in the outbox.

import { prisma } from "./db";

export type SapGoodsMovement = {
  BWART: "303" | "305" | "304"; // movement type: 303 = remove to transit, 305 = receive from transit, 304 = reversal of 303
  BUDAT: string; // posting date
  XBLNR: string; // reference = our transfer number
  ITEMS: {
    MATNR: string; // material
    WERKS: string; // plant posting this movement
    UMWRK?: string; // receiving / issuing partner plant
    MENGE: number; // quantity
    MEINS: string; // unit
  }[];
};

export interface SapAdapter {
  postGoodsMovement(m: SapGoodsMovement): Promise<{ materialDocument: string }>;
}

class MockSapAdapter implements SapAdapter {
  async postGoodsMovement(_m: SapGoodsMovement) {
    // SAP material documents are 10-digit numbers starting with 49 for goods movements
    const n = 4900000000 + Math.floor(Math.random() * 99999999);
    return { materialDocument: String(n) };
  }
}

export const sap: SapAdapter = new MockSapAdapter();

/** Deliver pending outbox events to SAP. Safe to run repeatedly (e.g. from a cron job). */
export async function processOutbox(limit = 50) {
  const pending = await prisma.outboxEvent.findMany({
    where: { status: { in: ["PENDING", "FAILED"] }, attempts: { lt: 5 } },
    orderBy: { id: "asc" },
    take: limit,
  });

  let sent = 0;
  let failed = 0;
  for (const ev of pending) {
    try {
      const movement = ev.payload as unknown as SapGoodsMovement;
      const { materialDocument } = await sap.postGoodsMovement(movement);

      await prisma.$transaction(async (tx) => {
        await tx.outboxEvent.update({
          where: { id: ev.id },
          data: {
            status: "SENT",
            attempts: { increment: 1 },
            externalRef: materialDocument,
            processedAt: new Date(),
            lastError: null,
          },
        });
        const t = await tx.transfer.update({
          where: { id: ev.transferId },
          data:
            movement.BWART === "305"
              ? { sapGoodsReceiptDoc: materialDocument }
              : movement.BWART === "303"
                ? { sapGoodsIssueDoc: materialDocument }
                : {},
          include: { lines: true },
        });
        await tx.transferEvent.create({
          data: {
            transferId: ev.transferId,
            type: "SAP_SYNCED",
            actor: "SAP integration",
            plantCode: movement.ITEMS[0]?.WERKS ?? "-",
            message: `Posted to SAP: movement type ${movement.BWART}, material document ${materialDocument}`,
            snapshot: JSON.parse(JSON.stringify(t)),
          },
        });
      });
      sent++;
    } catch (e) {
      await prisma.outboxEvent.update({
        where: { id: ev.id },
        data: { status: "FAILED", attempts: { increment: 1 }, lastError: String(e) },
      });
      failed++;
    }
  }
  return { processed: pending.length, sent, failed };
}
