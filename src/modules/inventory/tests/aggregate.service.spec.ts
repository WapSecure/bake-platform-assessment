import { Test, TestingModule } from '@nestjs/testing';
import { AggregateService } from '../services/aggregate.service';
import { PrismaService } from '../../../../prisma/prisma.service';

const mockPrismaService = {
  location: {
    findMany: jest.fn(),
  },
  inventoryItem2: {
    findMany: jest.fn(),
  },
  stockMovement: {
    findMany: jest.fn(),
  },
};

describe('AggregateService', () => {
  let service: AggregateService;
  let prisma: typeof mockPrismaService;

  beforeEach(async () => {
    jest.clearAllMocks();
    
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AggregateService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<AggregateService>(AggregateService);
    prisma = module.get(PrismaService);
  });

  it('should aggregate stock across multiple locations', async () => {
    const mockLocations = [
      { id: 'loc1', tenantId: 'parent1' },
      { id: 'loc2', tenantId: 'parent1' },
    ];
    
    const mockItems = [
      { id: 'item1', sku: 'COKE', name: 'Coke', locationId: 'loc1', tenantId: 'parent1' },
      { id: 'item2', sku: 'COKE', name: 'Coke', locationId: 'loc2', tenantId: 'parent1' },
    ];
    
    prisma.location.findMany.mockResolvedValue(mockLocations);
    prisma.inventoryItem2.findMany.mockResolvedValue(mockItems);
    
    jest.spyOn(service as any, 'getStockForItem')
      .mockResolvedValueOnce(50)
      .mockResolvedValueOnce(30);

    const result = await service.getAggregateStock('parent1');

    expect(result).toHaveLength(1);
    expect(result[0].sku).toBe('COKE');
    expect(result[0].totalStock).toBe(80);
    expect(result[0].locations).toEqual({
      loc1: 50,
      loc2: 30,
    });
  });

  it('should filter by SKUs when provided', async () => {
    const mockLocations = [{ id: 'loc1', tenantId: 'parent1' }];
    const mockItems = [{ id: 'item1', sku: 'COKE', name: 'Coke', locationId: 'loc1', tenantId: 'parent1' }];
    
    prisma.location.findMany.mockResolvedValue(mockLocations);
    prisma.inventoryItem2.findMany.mockResolvedValue(mockItems);
    jest.spyOn(service as any, 'getStockForItem').mockResolvedValue(50);

    const result = await service.getAggregateStock('parent1', ['COKE']);

    expect(prisma.inventoryItem2.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          sku: { in: ['COKE'] },
        }),
      })
    );
  });
});