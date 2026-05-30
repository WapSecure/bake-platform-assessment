import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';

@Injectable()
export class AggregateService {
  private readonly logger = new Logger(AggregateService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getAggregateStock(parentTenantId: string, skus?: string[]) {
    const locations = await this.prisma.location.findMany({
      where: { tenantId: parentTenantId },
    });

    const locationIds = locations.map(l => l.id);

    const skuFilter = skus && skus.length > 0 ? { sku: { in: skus } } : {};

    const items = await this.prisma.inventoryItem2.findMany({
      where: {
        tenantId: parentTenantId,
        locationId: { in: locationIds },
        ...skuFilter,
      },
    });

    const aggregate: Record<string, { sku: string; name: string; totalStock: number; locations: Record<string, number> }> = {};

    for (const item of items) {
      const stock = await this.getStockForItem(item.id);
      
      if (!aggregate[item.sku]) {
        aggregate[item.sku] = {
          sku: item.sku,
          name: item.name,
          totalStock: 0,
          locations: {},
        };
      }

      aggregate[item.sku].totalStock += stock;
      aggregate[item.sku].locations[item.locationId] = stock;
    }

    this.logger.log({ parentTenantId, skus, locationCount: locationIds.length }, 'Aggregate stock computed');
    
    return Object.values(aggregate);
  }

  private async getStockForItem(itemId: string): Promise<number> {
    const movements = await this.prisma.stockMovement.findMany({
      where: { itemId },
    });
    return movements.reduce((sum, m) => sum + m.quantity, 0);
  }
}