// Proves the database itself protects the audit trail and business rules.
import { prisma } from "../src/lib/db";

async function expectFail(label: string, fn: () => Promise<unknown>) {
  try { await fn(); console.log("FAIL (was allowed):", label); }
  catch (e) { console.log("OK blocked:", label, "->", String(e).split("\n").find(l => /append-only|violates|constraint/i.test(l))?.trim()); }
}

async function main() {
  await expectFail("edit an audit event", () => prisma.transferEvent.update({ where: { id: 1 }, data: { actor: "Someone else" } }));
  await expectFail("delete an audit event", () => prisma.transferEvent.delete({ where: { id: 1 } }));
  await expectFail("send to the same plant", () => prisma.transfer.update({ where: { id: 1 }, data: { toPlantCode: "1100" } }));
  await expectFail("negative received qty", () => prisma.transferLine.update({ where: { id: 1 }, data: { qtyReceived: -1 } }));
  console.log("Audit events still intact:", await prisma.transferEvent.count());
}
main().finally(() => prisma.$disconnect());
