-- CreateEnum
CREATE TYPE "TransferStatus" AS ENUM ('IN_TRANSIT', 'RECEIVED', 'RECEIVED_WITH_DISCREPANCY', 'CANCELLED');

-- CreateEnum
CREATE TYPE "OutboxStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');

-- CreateTable
CREATE TABLE "Plant" (
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,

    CONSTRAINT "Plant_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "Material" (
    "number" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "department" TEXT NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'EA',

    CONSTRAINT "Material_pkey" PRIMARY KEY ("number")
);

-- CreateTable
CREATE TABLE "Transfer" (
    "id" SERIAL NOT NULL,
    "transferNo" TEXT,
    "fromPlantCode" TEXT NOT NULL,
    "toPlantCode" TEXT NOT NULL,
    "jobOrderNo" TEXT NOT NULL,
    "status" "TransferStatus" NOT NULL DEFAULT 'IN_TRANSIT',
    "sentBy" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "vehicleRef" TEXT,
    "sendRemarks" TEXT,
    "receivedBy" TEXT,
    "receivedAt" TIMESTAMP(3),
    "receiveRemarks" TEXT,
    "cancelledBy" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "resolvedBy" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolutionNote" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "sapGoodsIssueDoc" TEXT,
    "sapGoodsReceiptDoc" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Transfer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransferLine" (
    "id" SERIAL NOT NULL,
    "transferId" INTEGER NOT NULL,
    "materialNumber" TEXT NOT NULL,
    "qtySent" INTEGER NOT NULL,
    "qtyReceived" INTEGER,
    "discrepancyReason" TEXT,
    "discrepancyNote" TEXT,

    CONSTRAINT "TransferLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransferEvent" (
    "id" SERIAL NOT NULL,
    "transferId" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "plantCode" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TransferEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutboxEvent" (
    "id" SERIAL NOT NULL,
    "transferId" INTEGER NOT NULL,
    "eventType" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "OutboxStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "externalRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "OutboxEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Transfer_transferNo_key" ON "Transfer"("transferNo");

-- CreateIndex
CREATE UNIQUE INDEX "Transfer_idempotencyKey_key" ON "Transfer"("idempotencyKey");

-- CreateIndex
CREATE INDEX "Transfer_status_idx" ON "Transfer"("status");

-- CreateIndex
CREATE INDEX "Transfer_toPlantCode_status_idx" ON "Transfer"("toPlantCode", "status");

-- CreateIndex
CREATE INDEX "Transfer_fromPlantCode_status_idx" ON "Transfer"("fromPlantCode", "status");

-- CreateIndex
CREATE INDEX "Transfer_jobOrderNo_idx" ON "Transfer"("jobOrderNo");

-- CreateIndex
CREATE UNIQUE INDEX "TransferLine_transferId_materialNumber_key" ON "TransferLine"("transferId", "materialNumber");

-- CreateIndex
CREATE INDEX "TransferEvent_transferId_createdAt_idx" ON "TransferEvent"("transferId", "createdAt");

-- CreateIndex
CREATE INDEX "OutboxEvent_status_createdAt_idx" ON "OutboxEvent"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "Transfer" ADD CONSTRAINT "Transfer_fromPlantCode_fkey" FOREIGN KEY ("fromPlantCode") REFERENCES "Plant"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transfer" ADD CONSTRAINT "Transfer_toPlantCode_fkey" FOREIGN KEY ("toPlantCode") REFERENCES "Plant"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransferLine" ADD CONSTRAINT "TransferLine_transferId_fkey" FOREIGN KEY ("transferId") REFERENCES "Transfer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransferLine" ADD CONSTRAINT "TransferLine_materialNumber_fkey" FOREIGN KEY ("materialNumber") REFERENCES "Material"("number") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransferEvent" ADD CONSTRAINT "TransferEvent_transferId_fkey" FOREIGN KEY ("transferId") REFERENCES "Transfer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Hand-written integrity rules (not expressible in Prisma schema language)
-- ---------------------------------------------------------------------------

-- 1. Audit trail is append-only: history can be added to, never edited or deleted.
CREATE OR REPLACE FUNCTION forbid_audit_change() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'TransferEvent is append-only: % is not allowed', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER transfer_event_append_only
  BEFORE UPDATE OR DELETE ON "TransferEvent"
  FOR EACH ROW EXECUTE FUNCTION forbid_audit_change();

-- 2. Business rules enforced by the database itself, not only by the UI.
ALTER TABLE "Transfer"
  ADD CONSTRAINT transfer_plants_differ CHECK ("fromPlantCode" <> "toPlantCode");

ALTER TABLE "TransferLine"
  ADD CONSTRAINT line_qty_sent_positive CHECK ("qtySent" > 0),
  ADD CONSTRAINT line_qty_received_not_negative CHECK ("qtyReceived" IS NULL OR "qtyReceived" >= 0);
