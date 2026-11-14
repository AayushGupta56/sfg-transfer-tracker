// Core business logic. Every state change follows the same pattern, inside ONE database transaction:
//   1. validate (who is acting, is the transition allowed, are quantities sane)
//   2. change the Transfer / TransferLines
//   3. append a TransferEvent (audit trail, with a full snapshot)
//   4. append an OutboxEvent for SAP (if the change has a stock effect)
// Either all four happen or none — the trail can never disagree with the data.

import { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { jobOrders } from "./jobOrders";
import { DISCREPANCY_REASONS } from "./constants";
import type { SapGoodsMovement } from "./sap";

export class DomainError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

export type Actor = { name: string; plantCode: string };

type Tx = Prisma.TransactionClient;

// The database is in another region: give multi-step transactions room to finish.
const TX_OPTIONS = { maxWait: 10_000, timeout: 20_000 };

const transferInclude = { lines: { include: { material: true } } } as const;

async function snapshot(tx: Tx, id: number) {
  const t = await tx.transfer.findUniqueOrThrow({ where: { id }, include: transferInclude });
  return JSON.parse(JSON.stringify(t)) as Prisma.InputJsonValue;
}

function isPositiveInt(n: unknown) {
  return typeof n === "number" && Number.isInteger(n) && n > 0 && n <= 1_000_000;
}

export function formatTransferNo(id: number) {
  return `TRF-${String(id).padStart(6, "0")}`;
}

// ---------------------------------------------------------------------------
// SEND
// ---------------------------------------------------------------------------

export type CreateTransferInput = {
  toPlantCode: string;
  jobOrderNo: string;
  lines: { materialNumber: string; qty: number }[];
  vehicleRef?: string;
  remarks?: string;
  idempotencyKey: string;
};

export async function createTransfer(actor: Actor, input: CreateTransferInput, at = new Date()) {
  if (!input.idempotencyKey) throw new DomainError("Missing idempotency key");

  // A retried / double-clicked submission returns the transfer that already exists.
  const existing = await prisma.transfer.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
  if (existing) return existing;

  const [from, to] = await Promise.all([
    prisma.plant.findUnique({ where: { code: actor.plantCode } }),
    prisma.plant.findUnique({ where: { code: input.toPlantCode } }),
  ]);
  if (!from) throw new DomainError("You are not acting for a valid plant");
  if (!to) throw new DomainError("Choose a valid destination plant");
  if (from.code === to.code) throw new DomainError("Destination must be a different plant");

  const jo = await jobOrders.get(input.jobOrderNo);
  if (!jo) throw new DomainError(`Job order ${input.jobOrderNo} does not exist in the job order system`);
  if (jo.status !== "RELEASED")
    throw new DomainError(`Job order ${jo.jobOrderNo} is ${jo.status}; SFGs can only be sent against a RELEASED job order`);

  const lines = (input.lines ?? []).filter((l) => l.qty !== 0);
  if (lines.length === 0) throw new DomainError("Enter a quantity for at least one part");
  const seen = new Set<string>();
  for (const l of lines) {
    if (!isPositiveInt(l.qty)) throw new DomainError(`Quantity for ${l.materialNumber} must be a whole number above 0`);
    if (seen.has(l.materialNumber)) throw new DomainError(`${l.materialNumber} is listed twice`);
    seen.add(l.materialNumber);
    if (!jo.components.some((c) => c.materialNumber === l.materialNumber))
      throw new DomainError(`${l.materialNumber} is not a component of ${jo.jobOrderNo}`);
  }

  return prisma.$transaction(async (tx) => {
    const t = await tx.transfer.create({
      data: {
        fromPlantCode: from.code,
        toPlantCode: to.code,
        jobOrderNo: jo.jobOrderNo,
        sentBy: actor.name,
        sentAt: at,
        vehicleRef: input.vehicleRef?.trim() || null,
        sendRemarks: input.remarks?.trim() || null,
        idempotencyKey: input.idempotencyKey,
        createdAt: at,
        lines: { create: lines.map((l) => ({ materialNumber: l.materialNumber, qtySent: l.qty })) },
      },
      include: transferInclude,
    });
    const transferNo = formatTransferNo(t.id);
    await tx.transfer.update({ where: { id: t.id }, data: { transferNo } });

    const total = lines.reduce((s, l) => s + l.qty, 0);
    await tx.transferEvent.create({
      data: {
        transferId: t.id,
        type: "SENT",
        actor: actor.name,
        plantCode: from.code,
        message: `Sent ${total} pcs (${lines.length} part type${lines.length > 1 ? "s" : ""}) from ${from.name} to ${to.name} for ${jo.jobOrderNo}`,
        snapshot: await snapshot(tx, t.id),
        createdAt: at,
      },
    });

    const movement: SapGoodsMovement = {
      BWART: "303",
      BUDAT: at.toISOString().slice(0, 10),
      XBLNR: transferNo,
      ITEMS: t.lines.map((l) => ({
        MATNR: l.materialNumber,
        WERKS: from.code,
        UMWRK: to.code,
        MENGE: l.qtySent,
        MEINS: l.material.unit,
      })),
    };
    await tx.outboxEvent.create({
      data: { transferId: t.id, eventType: "SAP_GOODS_ISSUE_303", payload: movement, createdAt: at },
    });

    return { ...t, transferNo };
  }, TX_OPTIONS);
}

// ---------------------------------------------------------------------------
// RECEIVE
// ---------------------------------------------------------------------------

export type ReceiveInput = {
  lines: { materialNumber: string; qtyReceived: number; reason?: string; note?: string }[];
  remarks?: string;
};

export async function receiveTransfer(actor: Actor, id: number, input: ReceiveInput, at = new Date()) {
  const t = await prisma.transfer.findUnique({ where: { id }, include: { ...transferInclude, toPlant: true } });
  if (!t) throw new DomainError("Transfer not found", 404);
  if (actor.plantCode !== t.toPlantCode)
    throw new DomainError(`Only someone at ${t.toPlant.name} can confirm receipt of this transfer`, 403);
  if (t.status !== "IN_TRANSIT")
    throw new DomainError(`This transfer is already ${t.status.replaceAll("_", " ").toLowerCase()}`, 409);

  const byMaterial = new Map(input.lines.map((l) => [l.materialNumber, l]));
  if (byMaterial.size !== t.lines.length || t.lines.some((l) => !byMaterial.has(l.materialNumber)))
    throw new DomainError("Enter a counted quantity for every line on the transfer");

  let discrepancyLines = 0;
  const updates = t.lines.map((line) => {
    const r = byMaterial.get(line.materialNumber)!;
    if (typeof r.qtyReceived !== "number" || !Number.isInteger(r.qtyReceived) || r.qtyReceived < 0)
      throw new DomainError(`Counted quantity for ${line.materialNumber} must be a whole number (0 or more)`);
    const reason = r.reason || null;
    if (reason && !DISCREPANCY_REASONS[reason]) throw new DomainError(`Unknown reason ${reason}`);
    const mismatch = r.qtyReceived !== line.qtySent;
    if (mismatch && !reason)
      throw new DomainError(
        `${line.materialNumber}: sent ${line.qtySent}, counted ${r.qtyReceived} — select a reason for the difference`,
      );
    if (reason === "OTHER" && !r.note?.trim())
      throw new DomainError(`${line.materialNumber}: explain the "Other" reason in the note`);
    if (mismatch || reason) discrepancyLines++;
    return {
      id: line.id,
      qtyReceived: r.qtyReceived,
      discrepancyReason: reason,
      discrepancyNote: r.note?.trim() || null,
    };
  });

  const status = discrepancyLines > 0 ? "RECEIVED_WITH_DISCREPANCY" : "RECEIVED";

  return prisma.$transaction(async (tx) => {
    // Conditional update = optimistic lock: if two people confirm at the same moment, only one wins.
    const res = await tx.transfer.updateMany({
      where: { id, status: "IN_TRANSIT" },
      data: { status, receivedBy: actor.name, receivedAt: at, receiveRemarks: input.remarks?.trim() || null },
    });
    if (res.count === 0) throw new DomainError("Someone else just updated this transfer — refresh the page", 409);

    for (const u of updates) {
      const { id: lineId, ...data } = u;
      await tx.transferLine.update({ where: { id: lineId }, data });
    }

    const sent = t.lines.reduce((s, l) => s + l.qtySent, 0);
    const got = updates.reduce((s, u) => s + u.qtyReceived, 0);
    await tx.transferEvent.create({
      data: {
        transferId: id,
        type: status,
        actor: actor.name,
        plantCode: actor.plantCode,
        message:
          status === "RECEIVED"
            ? `Receipt confirmed: all ${got} pcs counted and match the slip`
            : `Receipt confirmed with discrepancy on ${discrepancyLines} line(s): sent ${sent} pcs, counted ${got} usable pcs`,
        snapshot: await snapshot(tx, id),
        createdAt: at,
      },
    });

    const items = t.lines
      .map((l) => ({ l, qty: byMaterial.get(l.materialNumber)!.qtyReceived }))
      .filter((x) => x.qty > 0);
    if (items.length) {
      const movement: SapGoodsMovement = {
        BWART: "305",
        BUDAT: at.toISOString().slice(0, 10),
        XBLNR: t.transferNo!,
        ITEMS: items.map(({ l, qty }) => ({
          MATNR: l.materialNumber,
          WERKS: t.toPlantCode,
          UMWRK: t.fromPlantCode,
          MENGE: qty,
          MEINS: l.material.unit,
        })),
      };
      await tx.outboxEvent.create({
        data: { transferId: id, eventType: "SAP_GOODS_RECEIPT_305", payload: movement, createdAt: at },
      });
    }
    return { status };
  }, TX_OPTIONS);
}

// ---------------------------------------------------------------------------
// CANCEL (sender withdraws before receipt)
// ---------------------------------------------------------------------------

export async function cancelTransfer(actor: Actor, id: number, reason: string, at = new Date()) {
  const t = await prisma.transfer.findUnique({ where: { id }, include: { ...transferInclude, fromPlant: true } });
  if (!t) throw new DomainError("Transfer not found", 404);
  if (actor.plantCode !== t.fromPlantCode)
    throw new DomainError(`Only the sending plant (${t.fromPlant.name}) can cancel this transfer`, 403);
  if (t.status !== "IN_TRANSIT") throw new DomainError("Only a transfer that is still in transit can be cancelled", 409);
  if (!reason?.trim()) throw new DomainError("Give a reason for cancelling");

  return prisma.$transaction(async (tx) => {
    const res = await tx.transfer.updateMany({
      where: { id, status: "IN_TRANSIT" },
      data: { status: "CANCELLED", cancelledBy: actor.name, cancelledAt: at, cancelReason: reason.trim() },
    });
    if (res.count === 0) throw new DomainError("Someone else just updated this transfer — refresh the page", 409);

    await tx.transferEvent.create({
      data: {
        transferId: id,
        type: "CANCELLED",
        actor: actor.name,
        plantCode: actor.plantCode,
        message: `Cancelled by sender: ${reason.trim()}`,
        snapshot: await snapshot(tx, id),
        createdAt: at,
      },
    });
    const movement: SapGoodsMovement = {
      BWART: "304",
      BUDAT: at.toISOString().slice(0, 10),
      XBLNR: t.transferNo!,
      ITEMS: t.lines.map((l) => ({
        MATNR: l.materialNumber,
        WERKS: t.fromPlantCode,
        UMWRK: t.toPlantCode,
        MENGE: l.qtySent,
        MEINS: l.material.unit,
      })),
    };
    await tx.outboxEvent.create({
      data: { transferId: id, eventType: "SAP_REVERSAL_304", payload: movement, createdAt: at },
    });
  }, TX_OPTIONS);
}

// ---------------------------------------------------------------------------
// RESOLVE DISCREPANCY (closes the dispute with a written outcome)
// ---------------------------------------------------------------------------

export async function resolveDiscrepancy(actor: Actor, id: number, note: string, at = new Date()) {
  const t = await prisma.transfer.findUnique({ where: { id } });
  if (!t) throw new DomainError("Transfer not found", 404);
  if (actor.plantCode !== t.fromPlantCode && actor.plantCode !== t.toPlantCode)
    throw new DomainError("Only the sending or receiving plant can resolve this discrepancy", 403);
  if (t.status !== "RECEIVED_WITH_DISCREPANCY") throw new DomainError("This transfer has no discrepancy", 409);
  if (t.resolvedAt) throw new DomainError("This discrepancy is already resolved", 409);
  if (!note?.trim()) throw new DomainError("Describe how the discrepancy was resolved");

  return prisma.$transaction(async (tx) => {
    await tx.transfer.update({
      where: { id },
      data: { resolvedBy: actor.name, resolvedAt: at, resolutionNote: note.trim() },
    });
    await tx.transferEvent.create({
      data: {
        transferId: id,
        type: "DISCREPANCY_RESOLVED",
        actor: actor.name,
        plantCode: actor.plantCode,
        message: `Discrepancy closed: ${note.trim()}`,
        snapshot: await snapshot(tx, id),
        createdAt: at,
      },
    });
  }, TX_OPTIONS);
}
