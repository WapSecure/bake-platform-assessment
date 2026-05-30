import { Test, TestingModule } from '@nestjs/testing';
import { SyncService } from '../services/sync.service';
import { PrismaService } from '../../../../prisma/prisma.service';
import { IdempotencyService } from '../../../shared/idempotency/idempotency.service';
import { InventoryProjectionService } from '../services/inventory-projection.service';
import { ConflictResolutionService } from '../services/conflict-resolution.service';
import { OperationType } from '../dto/sync-operation.dto';
import { SyncRequestDto } from '../dto/sync-request.dto';

// Mock the entire PrismaService
const mockPrismaService = {
  inventoryMovement: {
    create: jest.fn().mockResolvedValue({}),
    findMany: jest.fn().mockResolvedValue([]),
  },
  syncOperation: {
    create: jest.fn().mockResolvedValue({}),
  },
  processedOperation: {
    findUnique: jest.fn().mockResolvedValue(null),
    upsert: jest.fn().mockResolvedValue({}),
  },
};

// Mock IdempotencyService
const mockIdempotencyService = {
  hasBeenProcessed: jest.fn().mockResolvedValue(false),
  markAsProcessed: jest.fn().mockResolvedValue(undefined),
};

describe('SyncService - Clean Sync', () => {
  let service: SyncService;
  let prisma: typeof mockPrismaService;

  beforeEach(async () => {
    // Reset all mocks before each test
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
    prisma = module.get(PrismaService);
  });

  it('should accept a valid restock operation', async () => {
    const request: SyncRequestDto = {
      tenantId: 'tenant_1',
      deviceId: 'device_1',
      operations: [
        {
          operationId: 'op_valid_1',
          itemId: 'item_1',
          type: OperationType.RESTOCK,
          quantity: 100,
          sequenceNumber: 1,
          timestamp: new Date().toISOString(),
        },
      ],
    };

    const result = await service.sync(request);

    expect(result.accepted).toHaveLength(1);
    expect(result.rejected).toHaveLength(0);
    expect(result.duplicates).toHaveLength(0);
    expect(result.accepted[0].operationId).toBe('op_valid_1');
    expect(result.accepted[0].status).toBe('ACCEPTED');
  });

  it('should accept a valid sale operation when stock is sufficient', async () => {
    // Mock that there is existing stock (100 units)
    mockPrismaService.inventoryMovement.findMany.mockResolvedValueOnce([
      { quantity: 100 } // Previous restock
    ]);

    const request: SyncRequestDto = {
      tenantId: 'tenant_1',
      deviceId: 'device_1',
      operations: [
        {
          operationId: 'op_valid_2',
          itemId: 'item_1',
          type: OperationType.SALE,
          quantity: 5,
          sequenceNumber: 2,
          timestamp: new Date().toISOString(),
        },
      ],
    };

    const result = await service.sync(request);

    expect(result.accepted).toHaveLength(1);
    expect(result.rejected).toHaveLength(0);
    expect(result.duplicates).toHaveLength(0);
    expect(result.accepted[0].operationId).toBe('op_valid_2');
  });

  it('should process multiple operations in sequence order', async () => {
    const request: SyncRequestDto = {
      tenantId: 'tenant_1',
      deviceId: 'device_1',
      operations: [
        {
          operationId: 'op_3',
          itemId: 'item_1',
          type: OperationType.SALE,
          quantity: 5,
          sequenceNumber: 3,
          timestamp: new Date().toISOString(),
        },
        {
          operationId: 'op_1',
          itemId: 'item_1',
          type: OperationType.RESTOCK,
          quantity: 100,
          sequenceNumber: 1,
          timestamp: new Date().toISOString(),
        },
        {
          operationId: 'op_2',
          itemId: 'item_1',
          type: OperationType.SALE,
          quantity: 10,
          sequenceNumber: 2,
          timestamp: new Date().toISOString(),
        },
      ],
    };

    const result = await service.sync(request);

    // All operations should be accepted because restock comes before sales
    expect(result.accepted).toHaveLength(3);
    expect(result.rejected).toHaveLength(0);
  });
});