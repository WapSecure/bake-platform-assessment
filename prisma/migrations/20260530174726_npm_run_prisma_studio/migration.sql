-- AlterTable
ALTER TABLE "task2_inventory_items" ADD COLUMN     "description" TEXT,
ADD COLUMN     "unitPrice" INTEGER;

-- AlterTable
ALTER TABLE "task2_stock_movements" ADD COLUMN     "notes" TEXT;

-- CreateIndex
CREATE INDEX "task2_inventory_items_tenantId_minThreshold_idx" ON "task2_inventory_items"("tenantId", "minThreshold");

-- CreateIndex
CREATE INDEX "task2_stock_movements_createdAt_idx" ON "task2_stock_movements"("createdAt");
