// Seeds master data (plants, SFG materials) and a few realistic demo transfers.
// Demo transfers are created through the SAME service functions the UI uses, so their
// audit trail and SAP outbox entries are genuine — just back-dated.
//
// Run: npm run db:seed   (wipes transactional data first)

import { randomUUID } from "crypto";
import { prisma } from "../src/lib/db";
import { createTransfer, receiveTransfer, cancelTransfer } from "../src/lib/transfers";

const hoursAgo = (h: number) => new Date(Date.now() - h * 3600_000);

async function main() {
  // TRUNCATE bypasses the append-only trigger (it only blocks row UPDATE/DELETE), so reset is possible.
  await prisma.$executeRawUnsafe(
    `TRUNCATE "OutboxEvent", "TransferEvent", "TransferLine", "Transfer", "Material", "Plant" RESTART IDENTITY CASCADE`,
  );

  await prisma.plant.createMany({
    data: [
      { code: "1100", name: "Plant 1", description: "Headers department — makes coil headers" },
      { code: "1200", name: "Plant 2", description: "Sheet Metal department — panels, pans, frames" },
      { code: "1300", name: "Plant 3", description: "Final assembly of AHUs" },
    ],
  });

  await prisma.material.createMany({
    data: [
      { number: "HDR-1001", description: "Supply header assembly, 54 mm Cu", department: "HEADERS" },
      { number: "HDR-1002", description: "Return header assembly, 54 mm Cu", department: "HEADERS" },
      { number: "HDR-1003", description: "Header assembly, 42 mm Cu", department: "HEADERS" },
      { number: "SM-2001", description: "Side casing panel, 1200 x 900", department: "SHEET_METAL" },
      { number: "SM-2002", description: "Drain pan, SS304", department: "SHEET_METAL" },
      { number: "SM-2003", description: "Base frame, 1500 mm", department: "SHEET_METAL" },
      { number: "SM-2004", description: "Fan bulkhead panel", department: "SHEET_METAL" },
    ],
  });

  const ravi = { name: "Ravi Kumar", plantCode: "1100" };
  const suresh = { name: "Suresh Nair", plantCode: "1200" };
  const ahmed = { name: "Ahmed Khan", plantCode: "1300" };

  // 1. Clean hand-off: headers sent to assembly, counted, matches.
  const t1 = await createTransfer(
    ravi,
    {
      toPlantCode: "1300",
      jobOrderNo: "JO-26-0101",
      lines: [
        { materialNumber: "HDR-1001", qty: 8 },
        { materialNumber: "HDR-1002", qty: 8 },
      ],
      vehicleRef: "Truck DXB-4471",
      idempotencyKey: randomUUID(),
    },
    hoursAgo(50),
  );
  await receiveTransfer(
    ahmed,
    t1.id,
    {
      lines: [
        { materialNumber: "HDR-1001", qtyReceived: 8 },
        { materialNumber: "HDR-1002", qtyReceived: 8 },
      ],
    },
    hoursAgo(47),
  );

  // 2. The classic dispute: 16 panels sent, 14 counted on arrival.
  const t2 = await createTransfer(
    suresh,
    {
      toPlantCode: "1300",
      jobOrderNo: "JO-26-0101",
      lines: [
        { materialNumber: "SM-2001", qty: 16 },
        { materialNumber: "SM-2002", qty: 4 },
      ],
      vehicleRef: "Trolley T-07",
      idempotencyKey: randomUUID(),
    },
    hoursAgo(30),
  );
  await receiveTransfer(
    ahmed,
    t2.id,
    {
      lines: [
        { materialNumber: "SM-2001", qtyReceived: 14, reason: "SHORT", note: "Only 14 panels on the trolley" },
        { materialNumber: "SM-2002", qtyReceived: 4 },
      ],
      remarks: "Informed Suresh by phone",
    },
    hoursAgo(26),
  );

  // 3. Sent more than a day ago and never confirmed -> shows as OVERDUE.
  await createTransfer(
    suresh,
    {
      toPlantCode: "1300",
      jobOrderNo: "JO-26-0102",
      lines: [
        { materialNumber: "SM-2001", qty: 12 },
        { materialNumber: "SM-2004", qty: 6 },
      ],
      vehicleRef: "Truck SHJ-1182",
      idempotencyKey: randomUUID(),
    },
    hoursAgo(28),
  );

  // 4. Sent a few hours ago, normal in-transit.
  await createTransfer(
    ravi,
    {
      toPlantCode: "1200",
      jobOrderNo: "JO-26-0103",
      lines: [{ materialNumber: "HDR-1003", qty: 10 }],
      vehicleRef: "Van V-3",
      idempotencyKey: randomUUID(),
    },
    hoursAgo(3),
  );

  // 5. Sender noticed a mistake before it left the gate and cancelled.
  const t5 = await createTransfer(
    ravi,
    {
      toPlantCode: "1300",
      jobOrderNo: "JO-26-0102",
      lines: [{ materialNumber: "HDR-1003", qty: 12 }],
      idempotencyKey: randomUUID(),
    },
    hoursAgo(20),
  );
  await cancelTransfer(ravi, t5.id, "Loaded 42 mm headers for wrong job — will re-send", hoursAgo(19.5));

  const counts = {
    plants: await prisma.plant.count(),
    materials: await prisma.material.count(),
    transfers: await prisma.transfer.count(),
    events: await prisma.transferEvent.count(),
    outbox: await prisma.outboxEvent.count(),
  };
  console.log("Seeded:", counts);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
