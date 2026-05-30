import { Injectable, Logger, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';
import { CreateItemDto } from '../dto/create-item.dto';
import { UpdateItemDto } from '../dto/update-item.dto';
import { RecordMovementDto, MovementType } from '../dto/record-movement.dto';

@Injectable()
export class InventoryService {
  private readonly logger = new Logger(InventoryService.name);

  constructor(private readonly prisma: PrismaService) {}

  async createItem(tenantId: string, dto: CreateItemDto) {
    const location = await this.prisma.location.findFirst({
      where: { id: dto.locationId, tenantId },
    });

    if (!location) {
      throw new ForbiddenException('Location not found or access denied');
    }

    const item = await this.prisma.inventoryItem2.create({
      data: {
        tenantId,
        locationId: dto.locationId,
        sku: dto.sku,
        name: dto.name,
        description: dto.description,
        unitPrice: dto.unitPrice,
        minThreshold: dto.minThreshold ?? 5,
      },
    });

    this.logger.log({ tenantId, itemId: item.id }, 'Inventory item created');
    return item;
  }

  async getItems(tenantId: string, locationId?: string) {
    const where: any = { tenantId };
    if (locationId) {
      where.locationId = locationId;
    }

    const items = await this.prisma.inventoryItem2.findMany({
      where,
      include: {
        location: true,
        movements: {
          orderBy: { createdAt: 'desc' },
          take: 5,
        },
      },
    });

    const itemsWithStock = await Promise.all(
      items.map(async (item) => ({
        ...item,
        currentStock: await this.getCurrentStock(item.id),
        isLowStock: (await this.getCurrentStock(item.id)) <= item.minThreshold,
      })),
    );

    return itemsWithStock;
  }

  async getItem(tenantId: string, itemId: string) {
    const item = await this.prisma.inventoryItem2.findFirst({
      where: { id: itemId, tenantId },
      include: {
        location: true,
        movements: {
          orderBy: { createdAt: 'desc' },
          take: 20,
        },
      },
    });

    if (!item) {
      throw new NotFoundException('Item not found');
    }

    const currentStock = await this.getCurrentStock(itemId);

    return { ...item, currentStock };
  }

  async updateItem(tenantId: string, itemId: string, dto: UpdateItemDto) {
    const existing = await this.prisma.inventoryItem2.findFirst({
      where: { id: itemId, tenantId },
    });

    if (!existing) {
      throw new NotFoundException('Item not found');
    }

    const updated = await this.prisma.inventoryItem2.update({
      where: { id: itemId },
      data: dto,
    });

    this.logger.log({ tenantId, itemId }, 'Inventory item updated');
    return updated;
  }

  async recordMovement(tenantId: string, dto: RecordMovementDto) {
    const item = await this.prisma.inventoryItem2.findFirst({
      where: { id: dto.itemId, tenantId },
    });

    if (!item) {
      throw new NotFoundException('Item not found');
    }

    let quantitySign = 1;
    switch (dto.type) {
      case MovementType.SALE:
      case MovementType.WASTE:
      case MovementType.TRANSFER_OUT:
        quantitySign = -1;
        break;
      case MovementType.RESTOCK:
      case MovementType.TRANSFER_IN:
        quantitySign = 1;
        break;
    }

    const movement = await this.prisma.stockMovement.create({
      data: {
        tenantId,
        locationId: dto.locationId,
        itemId: dto.itemId,
        type: dto.type,
        quantity: dto.quantity * quantitySign,
        referenceId: dto.referenceId,
        notes: dto.notes,
      },
    });

    const currentStock = await this.getCurrentStock(dto.itemId);
    if (currentStock <= item.minThreshold) {
      this.logger.warn({
        tenantId,
        itemId: dto.itemId,
        sku: item.sku,
        currentStock,
        threshold: item.minThreshold,
      }, 'LOW_STOCK_ALERT');
    }

    this.logger.log({ tenantId, itemId: dto.itemId, type: dto.type, quantity: dto.quantity }, 'Stock movement recorded');
    return movement;
  }

  async getCurrentStock(itemId: string): Promise<number> {
    const movements = await this.prisma.stockMovement.findMany({
      where: { itemId },
    });

    return movements.reduce((sum, m) => sum + m.quantity, 0);
  }

  async getStockByLocation(tenantId: string, locationId: string) {
    const items = await this.prisma.inventoryItem2.findMany({
      where: { tenantId, locationId },
    });

    const itemsWithStock = await Promise.all(
      items.map(async (item) => ({
        id: item.id,
        sku: item.sku,
        name: item.name,
        currentStock: await this.getCurrentStock(item.id),
        minThreshold: item.minThreshold,
        isLowStock: (await this.getCurrentStock(item.id)) <= item.minThreshold,
      })),
    );

    return itemsWithStock;
  }

  async deleteItem(tenantId: string, itemId: string) {
    const existing = await this.prisma.inventoryItem2.findFirst({
      where: { id: itemId, tenantId },
    });

    if (!existing) {
      throw new NotFoundException('Item not found');
    }

    await this.prisma.inventoryItem2.delete({
      where: { id: itemId },
    });

    this.logger.log({ tenantId, itemId }, 'Inventory item deleted');
    return { message: 'Item deleted successfully' };
  }
}