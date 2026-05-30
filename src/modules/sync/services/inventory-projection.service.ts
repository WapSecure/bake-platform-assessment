import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';

@Injectable()
export class InventoryProjectionService {
  private readonly logger = new Logger(InventoryProjectionService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getCurrentStock(itemId: string): Promise<number> {
    const movements = await this.prisma.inventoryMovement.findMany({
      where: { itemId },
    });

    const total = movements.reduce((sum, movement) => sum + movement.quantity, 0);
    return total;
  }

  async getInventoryItem(itemId: string) {
    return this.prisma.inventoryItem.findUnique({
      where: { id: itemId },
      include: {
        movements: {
          orderBy: {
            createdAt: 'desc',
          },
          take: 10,
        },
      },
    });
  }

  async getAllItems(tenantId: string) {
    return this.prisma.inventoryItem.findMany({
      where: { tenantId },
      include: {
        movements: {
          orderBy: {
            createdAt: 'desc',
          },
          take: 5,
        },
      },
    });
  }

  async getStockHistory(itemId: string, limit: number = 50) {
    return this.prisma.inventoryMovement.findMany({
      where: { itemId },
      orderBy: {
        createdAt: 'desc',
      },
      take: limit,
    });
  }
}