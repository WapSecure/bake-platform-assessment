import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../../app.module';
import { PrismaService } from '../../../../prisma/prisma.service';

describe('InventoryController (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let testTenantId: string;
  let testLocationId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    prisma = moduleFixture.get<PrismaService>(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /inventory/items', () => {
    it('should create a new inventory item', async () => {
      const tenant = await prisma.tenant.create({
        data: { name: 'Test Tenant', code: 'TEST' },
      });
      testTenantId = tenant.id;

      const location = await prisma.location.create({
        data: { tenantId: tenant.id, name: 'Test Location' },
      });
      testLocationId = location.id;

      const response = await request(app.getHttpServer())
        .post('/inventory/items')
        .set('x-tenant-id', tenant.id)
        .send({
          locationId: location.id,
          sku: 'TEST-SKU-001',
          name: 'Test Product',
          unitPrice: 1999,
          minThreshold: 10,
        })
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body.sku).toBe('TEST-SKU-001');
      expect(response.body.name).toBe('Test Product');
    });

    it('should return 403 when location does not belong to tenant', async () => {
      const tenant = await prisma.tenant.create({
        data: { name: 'Another Tenant', code: 'ANOTHER' },
      });
      const otherLocation = await prisma.location.create({
        data: { tenantId: tenant.id, name: 'Other Location' },
      });

      await request(app.getHttpServer())
        .post('/inventory/items')
        .set('x-tenant-id', 'different-tenant')
        .send({
          locationId: otherLocation.id,
          sku: 'TEST-SKU-002',
          name: 'Unauthorized Product',
        })
        .expect(403);
    });
  });

  describe('GET /inventory/items', () => {
    it('should list items for the tenant', async () => {
      const response = await request(app.getHttpServer())
        .get('/inventory/items')
        .set('x-tenant-id', testTenantId)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
    });
  });

  describe('POST /inventory/movements', () => {
    let testItemId: string;

    beforeAll(async () => {
      const item = await prisma.inventoryItem2.create({
        data: {
          tenantId: testTenantId,
          locationId: testLocationId,
          sku: 'MOVEMENT-TEST',
          name: 'Movement Test Item',
          minThreshold: 5,
        },
      });
      testItemId = item.id;
    });

    it('should record a RESTOCK movement', async () => {
      const response = await request(app.getHttpServer())
        .post('/inventory/movements')
        .set('x-tenant-id', testTenantId)
        .send({
          locationId: testLocationId,
          itemId: testItemId,
          type: 'RESTOCK',
          quantity: 100,
          notes: 'Initial stock',
        })
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body.quantity).toBe(100);
      expect(response.body.type).toBe('RESTOCK');
    });

    it('should record a SALE movement (reduces stock)', async () => {
      const response = await request(app.getHttpServer())
        .post('/inventory/movements')
        .set('x-tenant-id', testTenantId)
        .send({
          locationId: testLocationId,
          itemId: testItemId,
          type: 'SALE',
          quantity: 3,
          notes: 'Customer purchase',
        })
        .expect(201);

      expect(response.body.quantity).toBe(-3);
    });
  });

  describe('GET /inventory/stock/:itemId', () => {
    let testItemId: string;

    beforeAll(async () => {
      const item = await prisma.inventoryItem2.create({
        data: {
          tenantId: testTenantId,
          locationId: testLocationId,
          sku: 'STOCK-TEST',
          name: 'Stock Test Item',
        },
      });
      testItemId = item.id;

      await prisma.stockMovement.createMany({
        data: [
          { tenantId: testTenantId, locationId: testLocationId, itemId: testItemId, type: 'RESTOCK', quantity: 100 },
          { tenantId: testTenantId, locationId: testLocationId, itemId: testItemId, type: 'SALE', quantity: -30 },
          { tenantId: testTenantId, locationId: testLocationId, itemId: testItemId, type: 'WASTE', quantity: -5 },
        ],
      });
    });

    it('should return correct current stock', async () => {
      const response = await request(app.getHttpServer())
        .get(`/inventory/stock/${testItemId}`)
        .set('x-tenant-id', testTenantId)
        .expect(200);

      expect(response.body.currentStock).toBe(65);
    });
  });

  describe('GET /inventory/aggregate', () => {
    it('should return aggregate stock across locations', async () => {
      const response = await request(app.getHttpServer())
        .get('/inventory/aggregate')
        .set('x-parent-tenant-id', testTenantId)
        .query({ parentTenantId: testTenantId })
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
    });
  });

  describe('PUT /inventory/items/:id', () => {
    let testItemId: string;

    beforeAll(async () => {
      const item = await prisma.inventoryItem2.create({
        data: {
          tenantId: testTenantId,
          locationId: testLocationId,
          sku: 'UPDATE-TEST',
          name: 'Original Name',
        },
      });
      testItemId = item.id;
    });

    it('should update an inventory item', async () => {
      const response = await request(app.getHttpServer())
        .put(`/inventory/items/${testItemId}`)
        .set('x-tenant-id', testTenantId)
        .send({
          name: 'Updated Name',
          unitPrice: 2999,
        })
        .expect(200);

      expect(response.body.name).toBe('Updated Name');
      expect(response.body.unitPrice).toBe(2999);
    });
  });

  describe('DELETE /inventory/items/:id', () => {
    let testItemId: string;

    beforeAll(async () => {
      const item = await prisma.inventoryItem2.create({
        data: {
          tenantId: testTenantId,
          locationId: testLocationId,
          sku: 'DELETE-TEST',
          name: 'To Be Deleted',
        },
      });
      testItemId = item.id;
    });

    it('should delete an inventory item', async () => {
      await request(app.getHttpServer())
        .delete(`/inventory/items/${testItemId}`)
        .set('x-tenant-id', testTenantId)
        .expect(204);
    });

    it('should return 404 when deleting non-existent item', async () => {
      await request(app.getHttpServer())
        .delete('/inventory/items/non-existent-id')
        .set('x-tenant-id', testTenantId)
        .expect(404);
    });
  });
});