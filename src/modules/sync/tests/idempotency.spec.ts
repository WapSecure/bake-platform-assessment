import { Test, TestingModule } from '@nestjs/testing';
import { SyncService } from '../services/sync.service';
import { PrismaService } from '../../../../prisma/prisma.service';
import { IdempotencyService } from '../../../shared/idempotency/idempotency.service';
import { InventoryProjectionService } from '../services/inventory-projection.service';
import { ConflictResolutionService } from '../services/conflict-resolution.service';
import { OperationType } from '../dto/sync-operation.dto';
import { SyncRequestDto } from '../dto/sync-request.dto';

// Mock PrismaService
const mockPrismaService = {
  inventoryMovement: {
    create: jest.fn().mockResolvedValue({}),
    findMany: jest.fn().mockResolvedValue([]),
  },
  syncOperation: {
    create: jest.fn().mockResolvedValue({}),
  },
  processedOperation: {
    findUnique: jest.fn(),
    upsert: jest.fn().mockResolvedValue({}),
  },
};

// Mock IdempotencyService with tracking
let processedOperations: string[] = [];

const mockIdempotencyService = {
  hasBeenProcessed: jest.fn().mockImplementation(async (opId: string) => {
    return processedOperations.includes(opId);
  }),
  markAsProcessed: jest.fn().mockImplementation(async (opId: string) => {
    processedOperations.push(opId);
  }),
};

describe('SyncService - Idempotency', () => {
  let service: SyncService;

  beforeEach(async () => {
    jest.clearAllMocks();
    processedOperations = []; // Reset tracking
    
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

  it('should process an operation only once when sent multiple times', async () => {
    const operationId = 'op_idempotent_1';
    
    const request: SyncRequestDto = {
      tenantId: 'tenant_1',
      deviceId: 'device_1',
      operations: [
        {
          operationId,
          itemId: 'item_1',
          type: OperationType.RESTOCK,
          quantity: 50,
          sequenceNumber: 1,
          timestamp: new Date().toISOString(),
        },
      ],
    };

    // First sync
    const result1 = await service.sync(request);
    
    // Second sync with same operation ID
    const result2 = await service.sync(request);

    expect(result1.accepted).toHaveLength(1);
    expect(result2.duplicates).toHaveLength(1);
    expect(result2.duplicates[0].operationId).toBe(operationId);
    expect(result2.accepted).toHaveLength(0);
  });

  it('should skip duplicate operations in a batch', async () => {
    const duplicateOpId = 'op_duplicate_in_batch';
    
    const request: SyncRequestDto = {
      tenantId: 'tenant_1',
      deviceId: 'device_1',
      operations: [
        {
          operationId: duplicateOpId,
          itemId: 'item_1',
          type: OperationType.RESTOCK,
          quantity: 100,
          sequenceNumber: 1,
          timestamp: new Date().toISOString(),
        },
        {
          operationId: duplicateOpId, // Same ID again
          itemId: 'item_1',
          type: OperationType.SALE,
          quantity: 10,
          sequenceNumber: 2,
          timestamp: new Date().toISOString(),
        },
      ],
    };

    const result = await service.sync(request);

    // First occurrence accepted, second marked as duplicate
    expect(result.accepted).toHaveLength(1);
    expect(result.duplicates).toHaveLength(1);
    expect(result.duplicates[0].operationId).toBe(duplicateOpId);
  });
});