import { Test, TestingModule } from '@nestjs/testing';
import { SyncService } from '../services/sync.service';
import { PrismaService } from '../../../../prisma/prisma.service';
import { IdempotencyService } from '../../../shared/idempotency/idempotency.service';
import { InventoryProjectionService } from '../services/inventory-projection.service';
import { ConflictResolutionService } from '../services/conflict-resolution.service';
import { OperationType } from '../dto/sync-operation.dto';
import { SyncRequestDto } from '../dto/sync-request.dto';

// Mock PrismaService with insufficient stock scenario
const mockPrismaService = {
  inventoryMovement: {
    create: jest.fn().mockResolvedValue({}),
    findMany: jest.fn().mockResolvedValue([
      { quantity: 8 } // Current stock = 8
    ]),
  },
  syncOperation: {
    create: jest.fn().mockResolvedValue({}),
  },
  processedOperation: {
    findUnique: jest.fn().mockResolvedValue(null),
    upsert: jest.fn().mockResolvedValue({}),
  },
};

const mockIdempotencyService = {
  hasBeenProcessed: jest.fn().mockResolvedValue(false),
  markAsProcessed: jest.fn().mockResolvedValue(undefined),
};

describe('SyncService - Conflict Scenario', () => {
  let service: SyncService;

  beforeEach(async () => {
    jest.clearAllMocks();
    
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SyncService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        {
          provide: IdempotencyService,
          useValue: mockIdempotencyService,
        },
        InventoryProjectionService,
        ConflictResolutionService,
      ],
    }).compile();

    service = module.get<SyncService>(SyncService);
  });

  it('should reject a sale that would cause negative stock', async () => {
    const request: SyncRequestDto = {
      tenantId: 'tenant_1',
      deviceId: 'device_1',
      operations: [
        {
          operationId: 'op_conflict_1',
          itemId: 'item_1',
          type: OperationType.SALE,
          quantity: 10, // Trying to sell 10 but only 8 in stock
          sequenceNumber: 1,
          timestamp: new Date().toISOString(),
        },
      ],
    };

    const result = await service.sync(request);

    expect(result.accepted).toHaveLength(0);
    expect(result.rejected).toHaveLength(1);
    expect(result.duplicates).toHaveLength(0);
    expect(result.rejected[0].operationId).toBe('op_conflict_1');
    expect(result.rejected[0].reason).toContain('INSUFFICIENT_STOCK');
  });

  it('should reject multiple conflicting operations', async () => {
    // Mock stock of 5 units
    mockPrismaService.inventoryMovement.findMany.mockResolvedValueOnce([
      { quantity: 5 }
    ]);

    const request: SyncRequestDto = {
      tenantId: 'tenant_1',
      deviceId: 'device_1',
      operations: [
        {
          operationId: 'op_conflict_2',
          itemId: 'item_1',
          type: OperationType.SALE,
          quantity: 3, // OK (stock becomes 2)
          sequenceNumber: 1,
          timestamp: new Date().toISOString(),
        },
        {
          operationId: 'op_conflict_3',
          itemId: 'item_1',
          type: OperationType.SALE,
          quantity: 3, // Would cause negative (2 - 3 = -1)
          sequenceNumber: 2,
          timestamp: new Date().toISOString(),
        },
      ],
    };

    const result = await service.sync(request);

    // First accepted, second rejected
    expect(result.accepted).toHaveLength(1);
    expect(result.rejected).toHaveLength(1);
    expect(result.accepted[0].operationId).toBe('op_conflict_2');
    expect(result.rejected[0].operationId).toBe('op_conflict_3');
  });

  it('should accept a restock that resolves previous conflict', async () => {
    // Mock stock of 5 units
    mockPrismaService.inventoryMovement.findMany.mockResolvedValueOnce([
      { quantity: 5 }
    ]);

    const request: SyncRequestDto = {
      tenantId: 'tenant_1',
      deviceId: 'device_1',
      operations: [
        {
          operationId: 'op_sale_1',
          itemId: 'item_1',
          type: OperationType.SALE,
          quantity: 10, // Would cause negative
          sequenceNumber: 1,
          timestamp: new Date().toISOString(),
        },
        {
          operationId: 'op_restock_1',
          itemId: 'item_1',
          type: OperationType.RESTOCK,
          quantity: 20, // Restock after sale (but sale will fail)
          sequenceNumber: 2,
          timestamp: new Date().toISOString(),
        },
      ],
    };

    const result = await service.sync(request);

    // Sale should be rejected (insufficient stock at processing time)
    // Restock should be accepted
    expect(result.rejected).toHaveLength(1);
    expect(result.accepted).toHaveLength(1);
    expect(result.rejected[0].operationId).toBe('op_sale_1');
    expect(result.accepted[0].operationId).toBe('op_restock_1');
  });
});