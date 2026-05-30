import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database for Task 2...');

  const parentTenant = await prisma.tenant.upsert({
    where: { code: 'PARENT_CORP' },
    update: {},
    create: {
      name: 'Parent Restaurant Corporation',
      code: 'PARENT_CORP',
    },
  });
  console.log(`✅ Tenant: ${parentTenant.name} (ID: ${parentTenant.id})`);

  const location1 = await prisma.location.upsert({
    where: { tenantId_name: { tenantId: parentTenant.id, name: 'Downtown Restaurant' } },
    update: {},
    create: {
      tenantId: parentTenant.id,
      name: 'Downtown Restaurant',
      address: '123 Main St, City',
    },
  });
  console.log(`✅ Location 1: ${location1.name} (ID: ${location1.id})`);

  const location2 = await prisma.location.upsert({
    where: { tenantId_name: { tenantId: parentTenant.id, name: 'Uptown Restaurant' } },
    update: {},
    create: {
      tenantId: parentTenant.id,
      name: 'Uptown Restaurant',
      address: '456 High St, City',
    },
  });
  console.log(`✅ Location 2: ${location2.name} (ID: ${location2.id})`);

  const item1 = await prisma.inventoryItem2.upsert({
    where: {
      tenantId_locationId_sku: {
        tenantId: parentTenant.id,
        locationId: location1.id,
        sku: 'COKE-12OZ',
      },
    },
    update: {},
    create: {
      tenantId: parentTenant.id,
      locationId: location1.id,
      sku: 'COKE-12OZ',
      name: 'Coca Cola 12oz',
      description: 'Classic carbonated soft drink',
      unitPrice: 150,
      minThreshold: 10,
    },
  });
  console.log(`✅ Item: ${item1.sku} at ${location1.name} (ID: ${item1.id})`);

  const item2 = await prisma.inventoryItem2.upsert({
    where: {
      tenantId_locationId_sku: {
        tenantId: parentTenant.id,
        locationId: location2.id,
        sku: 'COKE-12OZ',
      },
    },
    update: {},
    create: {
      tenantId: parentTenant.id,
      locationId: location2.id,
      sku: 'COKE-12OZ',
      name: 'Coca Cola 12oz',
      description: 'Classic carbonated soft drink',
      unitPrice: 150,
      minThreshold: 10,
    },
  });
  console.log(`✅ Item: ${item2.sku} at ${location2.name} (ID: ${item2.id})`);

  const item3 = await prisma.inventoryItem2.upsert({
    where: {
      tenantId_locationId_sku: {
        tenantId: parentTenant.id,
        locationId: location1.id,
        sku: 'BURGER',
      },
    },
    update: {},
    create: {
      tenantId: parentTenant.id,
      locationId: location1.id,
      sku: 'BURGER',
      name: 'Classic Burger',
      description: 'Beef patty with lettuce and tomato',
      unitPrice: 850,
      minThreshold: 20,
    },
  });
  console.log(`✅ Item: ${item3.sku} at ${location1.name}`);

  const item4 = await prisma.inventoryItem2.upsert({
    where: {
      tenantId_locationId_sku: {
        tenantId: parentTenant.id,
        locationId: location2.id,
        sku: 'FRIES',
      },
    },
    update: {},
    create: {
      tenantId: parentTenant.id,
      locationId: location2.id,
      sku: 'FRIES',
      name: 'French Fries',
      description: 'Golden crispy fries',
      unitPrice: 300,
      minThreshold: 30,
    },
  });
  console.log(`✅ Item: ${item4.sku} at ${location2.name}`);

  // Record initial stock movements (check if already exists to avoid duplicates)
  const existingMovements = await prisma.stockMovement.count({
    where: { itemId: item1.id },
  });

  if (existingMovements === 0) {
    await prisma.stockMovement.create({
      data: {
        tenantId: parentTenant.id,
        locationId: location1.id,
        itemId: item1.id,
        type: 'RESTOCK',
        quantity: 100,
        notes: 'Initial stock - Main warehouse delivery',
      },
    });
    console.log(`✅ Added 100 units of ${item1.sku} to ${location1.name}`);

    await prisma.stockMovement.create({
      data: {
        tenantId: parentTenant.id,
        locationId: location2.id,
        itemId: item2.id,
        type: 'RESTOCK',
        quantity: 50,
        notes: 'Initial stock - Main warehouse delivery',
      },
    });
    console.log(`✅ Added 50 units of ${item2.sku} to ${location2.name}`);

    await prisma.stockMovement.create({
      data: {
        tenantId: parentTenant.id,
        locationId: location1.id,
        itemId: item3.id,
        type: 'RESTOCK',
        quantity: 50,
        notes: 'Initial stock - Main warehouse delivery',
      },
    });
    console.log(`✅ Added 50 units of ${item3.sku} to ${location1.name}`);

    await prisma.stockMovement.create({
      data: {
        tenantId: parentTenant.id,
        locationId: location2.id,
        itemId: item4.id,
        type: 'RESTOCK',
        quantity: 100,
        notes: 'Initial stock - Main warehouse delivery',
      },
    });
    console.log(`✅ Added 100 units of ${item4.sku} to ${location2.name}`);
  } else {
    console.log('⏭️  Stock movements already exist, skipping...');
  }

  console.log('\n🎉 Seeding completed successfully!');
  console.log('\n📋 Test Data Summary:');
  console.log(`   Tenant ID: ${parentTenant.id}`);
  console.log(`   Location 1 (Downtown) ID: ${location1.id}`);
  console.log(`   Location 2 (Uptown) ID: ${location2.id}`);
  console.log(`\n   Item IDs for testing:`);
  console.log(`   - Downtown COKE ID: ${item1.id}`);
  console.log(`   - Downtown BURGER ID: ${item3.id}`);
  console.log(`   - Uptown COKE ID: ${item2.id}`);
  console.log(`   - Uptown FRIES ID: ${item4.id}`);
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });