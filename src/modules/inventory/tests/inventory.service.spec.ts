import { Test, TestingModule } from '@nestjs/testing';
import { InventoryService } from '../services/inventory.service';
import { PrismaService } from '../../../../prisma/prisma.service';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { MovementType } from '../dto/record-movement.dto';

const mockPrismaService = {
  location: {
    findFirst: jest.fn(),
  },
  inventoryItem2: {
    create: jest.fn(),
    findMany: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  stockMovement: {
    create: jest.fn(),
    findMany: jest.fn(),
  },
};

describe('InventoryService', () => {
  let service: InventoryService;
  let prisma: typeof mockPrismaService;

  beforeEach(async () => {
    jest.clearAllMocks();
    
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InventoryService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<InventoryService>(InventoryService);
    prisma = module.get(PrismaService);
  });

  describe('createItem', () => {
    it('should create an item when location exists', async () => {
      const mockLocation = { id: 'loc1', tenantId: 'tenant1' };
      const mockItem = { id: 'item1', name: 'Test Item' };
      
      prisma.location.findFirst.mockResolvedValue(mockLocation);
      prisma.inventoryItem2.create.mockResolvedValue(mockItem);

      const result = await service.createItem('tenant1', {
        locationId: 'loc1',
        sku: 'TEST-001',
        name: 'Test Item',
      });

      expect(result).toEqual(mockItem);
      expect(prisma.inventoryItem2.create).toHaveBeenCalled();
    });

    it('should throw ForbiddenException when location not found', async () => {
      prisma.location.findFirst.mockResolvedValue(null);

      await expect(service.createItem('tenant1', {
        locationId: 'loc1',
        sku: 'TEST-001',
        name: 'Test Item',
      })).rejects.toThrow(ForbiddenException);
    });
  });

  describe('getItems', () => {
    it('should return items with current stock', async () => {
      const mockItems = [
        { id: 'item1', tenantId: 'tenant1', locationId: 'loc1', sku: 'ITEM1', name: 'Item 1', minThreshold: 5, location: {}, movements: [] },
      ];
      
      prisma.inventoryItem2.findMany.mockResolvedValue(mockItems);
      jest.spyOn(service, 'getCurrentStock').mockResolvedValue(10);

      const result = await service.getItems('tenant1');
      
      expect(result).toHaveLength(1);
      expect(result[0].currentStock).toBe(10);
    });
  });

  describe('recordMovement', () => {
    it('should record a SALE movement (negative quantity)', async () => {
      const mockItem = { id: 'item1', tenantId: 'tenant1', sku: 'ITEM1', minThreshold: 5 };
      const mockMovement = { id: 'mov1', type: 'SALE', quantity: -5 };
      
      prisma.inventoryItem2.findFirst.mockResolvedValue(mockItem);
      prisma.stockMovement.create.mockResolvedValue(mockMovement);
      jest.spyOn(service, 'getCurrentStock').mockResolvedValue(95);

      const result = await service.recordMovement('tenant1', {
        locationId: 'loc1',
        itemId: 'item1',
        type: MovementType.SALE,
        quantity: 5,
      });

      expect(result).toEqual(mockMovement);
      expect(prisma.stockMovement.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          quantity: -5,
          type: 'SALE',
        }),
      });
    });

    it('should record a RESTOCK movement (positive quantity)', async () => {
      const mockItem = { id: 'item1', tenantId: 'tenant1', sku: 'ITEM1', minThreshold: 5 };
      const mockMovement = { id: 'mov1', type: 'RESTOCK', quantity: 100 };
      
      prisma.inventoryItem2.findFirst.mockResolvedValue(mockItem);
      prisma.stockMovement.create.mockResolvedValue(mockMovement);
      jest.spyOn(service, 'getCurrentStock').mockResolvedValue(100);

      const result = await service.recordMovement('tenant1', {
        locationId: 'loc1',
        itemId: 'item1',
        type: MovementType.RESTOCK,
        quantity: 100,
      });

      expect(prisma.stockMovement.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          quantity: 100,
          type: 'RESTOCK',
        }),
      });
    });

    it('should log warning when stock falls below threshold', async () => {
      const mockItem = { id: 'item1', tenantId: 'tenant1', sku: 'ITEM1', minThreshold: 10 };
      const warnSpy = jest.spyOn(service['logger'], 'warn');
      
      prisma.inventoryItem2.findFirst.mockResolvedValue(mockItem);
      prisma.stockMovement.create.mockResolvedValue({});
      jest.spyOn(service, 'getCurrentStock').mockResolvedValue(5);

      await service.recordMovement('tenant1', {
        locationId: 'loc1',
        itemId: 'item1',
        type: MovementType.SALE,
        quantity: 10,
      });

      expect(warnSpy).toHaveBeenCalled();
    });
  });

  describe('getCurrentStock', () => {
    it('should calculate correct stock from movements', async () => {
      const mockMovements = [
        { quantity: 100 },
        { quantity: -30 },
        { quantity: -10 },
      ];
      
      prisma.stockMovement.findMany.mockResolvedValue(mockMovements);

      const stock = await service.getCurrentStock('item1');
      
      expect(stock).toBe(60);
    });
  });
});