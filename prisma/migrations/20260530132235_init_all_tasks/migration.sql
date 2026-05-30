-- CreateEnum
CREATE TYPE "InventoryMovementType" AS ENUM ('SALE', 'RESTOCK', 'ADJUSTMENT', 'WASTE');

-- CreateEnum
CREATE TYPE "StockMovementType" AS ENUM ('SALE', 'RESTOCK', 'WASTE', 'TRANSFER_IN', 'TRANSFER_OUT');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('INITIATED', 'PROCESSING', 'CONFIRMED', 'FAILED_TIMEOUT', 'FAILED_PROVIDER_ERROR', 'FAILED_NETWORK', 'REFUNDED');

-- CreateEnum
CREATE TYPE "PaymentEventType" AS ENUM ('INITIATED', 'PROVIDER_CALLED', 'PROVIDER_RESPONSE', 'PROVIDER_TIMEOUT', 'CONFIRMED', 'FAILED', 'REFUNDED');

-- CreateTable
CREATE TABLE "task1_inventory_items" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "task1_inventory_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task1_inventory_movements" (
    "id" TEXT NOT NULL,
    "operationId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "type" "InventoryMovementType" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "sourceDeviceId" TEXT NOT NULL,
    "sequenceNumber" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "task1_inventory_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task1_processed_operations" (
    "operationId" TEXT NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deviceId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,

    CONSTRAINT "task1_processed_operations_pkey" PRIMARY KEY ("operationId")
);

-- CreateTable
CREATE TABLE "task1_sync_operations" (
    "id" TEXT NOT NULL,
    "operationId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "sequence" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "reason" TEXT,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task1_sync_operations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task2_tenants" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "task2_tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task2_locations" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "task2_locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task2_inventory_items" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "minThreshold" INTEGER NOT NULL DEFAULT 5,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "task2_inventory_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task2_stock_movements" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "type" "StockMovementType" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "referenceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task2_stock_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task3_payment_requests" (
    "id" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'NGN',
    "status" "PaymentStatus" NOT NULL DEFAULT 'INITIATED',
    "providerId" TEXT,
    "errorMessage" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "confirmedAt" TIMESTAMP(3),
    "refundedAt" TIMESTAMP(3),

    CONSTRAINT "task3_payment_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task3_payment_events" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "eventType" "PaymentEventType" NOT NULL,
    "status" "PaymentStatus" NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task3_payment_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task3_reconciliation_logs" (
    "id" TEXT NOT NULL,
    "runAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "discrepancies" JSONB NOT NULL,
    "resolvedCount" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL,
    "errorMessage" TEXT,

    CONSTRAINT "task3_reconciliation_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "task1_inventory_items_tenantId_idx" ON "task1_inventory_items"("tenantId");

-- CreateIndex
CREATE INDEX "task1_inventory_items_sku_idx" ON "task1_inventory_items"("sku");

-- CreateIndex
CREATE UNIQUE INDEX "task1_inventory_movements_operationId_key" ON "task1_inventory_movements"("operationId");

-- CreateIndex
CREATE INDEX "task1_inventory_movements_tenantId_itemId_idx" ON "task1_inventory_movements"("tenantId", "itemId");

-- CreateIndex
CREATE INDEX "task1_inventory_movements_operationId_idx" ON "task1_inventory_movements"("operationId");

-- CreateIndex
CREATE INDEX "task1_processed_operations_tenantId_idx" ON "task1_processed_operations"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "task1_sync_operations_operationId_key" ON "task1_sync_operations"("operationId");

-- CreateIndex
CREATE INDEX "task1_sync_operations_tenantId_deviceId_idx" ON "task1_sync_operations"("tenantId", "deviceId");

-- CreateIndex
CREATE INDEX "task1_sync_operations_syncedAt_idx" ON "task1_sync_operations"("syncedAt");

-- CreateIndex
CREATE UNIQUE INDEX "task2_tenants_code_key" ON "task2_tenants"("code");

-- CreateIndex
CREATE INDEX "task2_locations_tenantId_idx" ON "task2_locations"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "task2_locations_tenantId_name_key" ON "task2_locations"("tenantId", "name");

-- CreateIndex
CREATE INDEX "task2_inventory_items_tenantId_sku_idx" ON "task2_inventory_items"("tenantId", "sku");

-- CreateIndex
CREATE INDEX "task2_inventory_items_locationId_idx" ON "task2_inventory_items"("locationId");

-- CreateIndex
CREATE UNIQUE INDEX "task2_inventory_items_tenantId_locationId_sku_key" ON "task2_inventory_items"("tenantId", "locationId", "sku");

-- CreateIndex
CREATE INDEX "task2_stock_movements_tenantId_locationId_createdAt_idx" ON "task2_stock_movements"("tenantId", "locationId", "createdAt");

-- CreateIndex
CREATE INDEX "task2_stock_movements_itemId_idx" ON "task2_stock_movements"("itemId");

-- CreateIndex
CREATE INDEX "task2_stock_movements_type_idx" ON "task2_stock_movements"("type");

-- CreateIndex
CREATE UNIQUE INDEX "task3_payment_requests_idempotencyKey_key" ON "task3_payment_requests"("idempotencyKey");

-- CreateIndex
CREATE INDEX "task3_payment_requests_idempotencyKey_idx" ON "task3_payment_requests"("idempotencyKey");

-- CreateIndex
CREATE INDEX "task3_payment_requests_orderId_idx" ON "task3_payment_requests"("orderId");

-- CreateIndex
CREATE INDEX "task3_payment_requests_tenantId_status_idx" ON "task3_payment_requests"("tenantId", "status");

-- CreateIndex
CREATE INDEX "task3_payment_requests_createdAt_idx" ON "task3_payment_requests"("createdAt");

-- CreateIndex
CREATE INDEX "task3_payment_events_paymentId_createdAt_idx" ON "task3_payment_events"("paymentId", "createdAt");

-- CreateIndex
CREATE INDEX "task3_payment_events_eventType_idx" ON "task3_payment_events"("eventType");

-- CreateIndex
CREATE INDEX "task3_reconciliation_logs_runAt_idx" ON "task3_reconciliation_logs"("runAt");

-- AddForeignKey
ALTER TABLE "task1_inventory_movements" ADD CONSTRAINT "task1_inventory_movements_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "task1_inventory_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task1_sync_operations" ADD CONSTRAINT "task1_sync_operations_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "task1_inventory_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task2_locations" ADD CONSTRAINT "task2_locations_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "task2_tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task2_inventory_items" ADD CONSTRAINT "task2_inventory_items_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "task2_tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task2_inventory_items" ADD CONSTRAINT "task2_inventory_items_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "task2_locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task2_stock_movements" ADD CONSTRAINT "task2_stock_movements_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "task2_inventory_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task3_payment_events" ADD CONSTRAINT "task3_payment_events_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "task3_payment_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
