import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';
import { IdempotencyService } from '../../../shared/idempotency/idempotency.service';
import { InventoryProjectionService } from './inventory-projection.service';
import { ConflictResolutionService } from './conflict-resolution.service';
import { SyncRequestDto } from '../dto/sync-request.dto';
import { SyncResponseDto } from '../dto/sync-response.dto';

@Injectable()
export class SyncService {
  private readonly logger = new Logger(SyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly idempotencyService: IdempotencyService,
    private readonly projectionService: InventoryProjectionService,
    private readonly conflictService: ConflictResolutionService,
  ) {}

  async sync(request: SyncRequestDto): Promise<SyncResponseDto> {
    const startTime = Date.now();
    const { tenantId, deviceId, operations } = request;
    
    const sortedOps = [...operations].sort((a, b) => a.sequenceNumber - b.sequenceNumber);
    
    const accepted: { operationId: string; status: string }[] = [];
    const rejected: { operationId: string; status: string; reason: string }[] = [];
    const duplicates: { operationId: string; status: string }[] = [];

    for (const operation of sortedOps) {
      try {
        // Check idempotency
        const alreadyProcessed = await this.idempotencyService.hasBeenProcessed(operation.operationId);
        if (alreadyProcessed) {
          duplicates.push({
            operationId: operation.operationId,
            status: 'DUPLICATE_SKIPPED',
          });
          continue;
        }

        const quantityValidation = this.conflictService.validateQuantity(operation.type, operation.quantity);
        if (!quantityValidation.valid) {
          rejected.push({
            operationId: operation.operationId,
            status: 'REJECTED',
            reason: `INVALID_QUANTITY: ${quantityValidation.message}`,
          });
          
          try {
            await this.prisma.syncOperation.upsert({
              where: { operationId: operation.operationId },
              update: {
                status: 'REJECTED',
                reason: quantityValidation.message,
              },
              create: {
                operationId: operation.operationId,
                tenantId,
                deviceId,
                itemId: operation.itemId || 'unknown',
                type: operation.type,
                quantity: operation.quantity,
                sequence: operation.sequenceNumber,
                status: 'REJECTED',
                reason: quantityValidation.message,
              },
            });
          } catch (dbError: unknown) {
            const dbErrorMessage = dbError instanceof Error ? dbError.message : 'Unknown database error';
            this.logger.warn(`Could not create syncOperation record for ${operation.operationId}: ${dbErrorMessage}`);
          }
          continue;
        }

        await this.ensureItemExists(tenantId, operation.itemId);

        const currentStock = await this.projectionService.getCurrentStock(operation.itemId);
        const normalizedQuantity = this.conflictService.normalizeQuantity(operation.type, operation.quantity);
        const hasConflict = this.conflictService.wouldCauseNegativeStock(currentStock, normalizedQuantity);
        
        if (hasConflict) {
          rejected.push({
            operationId: operation.operationId,
            status: 'REJECTED',
            reason: `INSUFFICIENT_STOCK: current stock ${currentStock}, requested change ${normalizedQuantity}`,
          });
          
          await this.prisma.syncOperation.upsert({
            where: { operationId: operation.operationId },
            update: {
              status: 'REJECTED',
              reason: 'INSUFFICIENT_STOCK',
            },
            create: {
              operationId: operation.operationId,
              tenantId,
              deviceId,
              itemId: operation.itemId,
              type: operation.type,
              quantity: operation.quantity,
              sequence: operation.sequenceNumber,
              status: 'REJECTED',
              reason: 'INSUFFICIENT_STOCK',
            },
          });
          continue;
        }
        
        await this.prisma.inventoryMovement.create({
          data: {
            operationId: operation.operationId,
            tenantId,
            itemId: operation.itemId,
            type: operation.type as any,
            quantity: normalizedQuantity,
            sourceDeviceId: deviceId,
            sequenceNumber: operation.sequenceNumber,
            createdAt: new Date(operation.timestamp),
          },
        });
        
        await this.idempotencyService.markAsProcessed(operation.operationId, deviceId, tenantId);
        
        await this.prisma.syncOperation.upsert({
          where: { operationId: operation.operationId },
          update: {
            status: 'ACCEPTED',
            reason: null,
          },
          create: {
            operationId: operation.operationId,
            tenantId,
            deviceId,
            itemId: operation.itemId,
            type: operation.type,
            quantity: operation.quantity,
            sequence: operation.sequenceNumber,
            status: 'ACCEPTED',
          },
        });
        
        accepted.push({
          operationId: operation.operationId,
          status: 'ACCEPTED',
        });
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        this.logger.error(`Error processing operation ${operation.operationId}: ${errorMessage}`);
        rejected.push({
          operationId: operation.operationId,
          status: 'REJECTED',
          reason: `INTERNAL_ERROR: ${errorMessage}`,
        });
      }
    }
    
    this.logger.log({
      message: 'Sync completed',
      tenantId,
      deviceId,
      totalOperations: operations.length,
      accepted: accepted.length,
      rejected: rejected.length,
      duplicates: duplicates.length,
      durationMs: Date.now() - startTime,
    });
    
    return {
      accepted,
      rejected,
      duplicates,
    };
  }

  private async ensureItemExists(tenantId: string, itemId: string): Promise<void> {
    const existing = await this.prisma.inventoryItem.findUnique({
      where: { id: itemId },
    });

    if (!existing) {
      await this.prisma.inventoryItem.create({
        data: {
          id: itemId,
          tenantId,
          sku: itemId,
          name: `Item ${itemId}`,
        },
      });
      this.logger.log(`Created new inventory item: ${itemId} for tenant: ${tenantId}`);
    }
  }
}