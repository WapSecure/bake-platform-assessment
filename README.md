# Bake Platform Assessment

Task 1: Offline-First Sync Engine

Overview
A production-grade offline-first inventory sync engine that enables POS devices to operate offline and synchronize inventory changes when connectivity is restored. Built with NestJS, PostgreSQL, Prisma, and TypeScript.

Architecture Decision: Event-Based Inventory Movements
Instead of storing mutable stock quantities, we store immutable inventory events:


SALE -2      → Customer purchased 2 items
RESTOCK +5   → Added 5 items to inventory  
WASTE -1     → Removed 1 expired item
ADJUSTMENT -2 → Manual inventory correction

Why this approach:

✅ Complete audit trail - Every inventory change is recorded forever

✅ No silent data loss - Cannot overwrite previous state

✅ Easier reconciliation - Can replay events to verify current stock

✅ Distributed-system safe - Events can be merged deterministically

✅ Production proven - Used by serious retail/fintech systems

Conflict Resolution Strategy: Server-Validated Event Merging:

Strategy	                               Pros	                                           Cons	                                           Our Choice

Last-Write-Wins	                           Simple	                                       Data loss risk, client clocks may skew              ❌

CRDTs	                                   No data loss, eventual consistency              Complex, high memory, overkill for POS              ❌

Server Wins	                               Authoritative, simple	                       Client UX degrades, offline operations may fail     ❌

Event-based + Validation	               Audit trail, deterministic, no data loss	       Requires event replay	                           ✅



How it works:

- All operations are stored as immutable events (never modified)

- Server validates each operation against current projected state

- Operations causing negative inventory are REJECTED (not silently applied)

- Sequence numbers ensure deterministic ordering across devices

- Timestamps act as tie-breaker when sequence numbers are equal


Why This Strategy for POS Systems:

Real POS systems prioritize inventory accuracy over convenience. It's better to reject an invalid sale than to allow negative inventory (which would require manual reconciliation later).

Idempotency Design
Problem: Network failures cause automatic retries → duplicate charges/inventory changes

Solution:

Each operation has a unique operationId (client-generated UUID)

Server stores processed_operations table with operationId

Duplicate operations return DUPLICATE_SKIPPED status


Idempotency Scope: Global across all tenants (security feature prevents cross-tenant replay attacks)

Example:

// First request - ACCEPTED
{ operationId: "op_abc123", type: "SALE", quantity: 2 }

// Second request (retry) - DUPLICATE_SKIPPED
{ operationId: "op_abc123", type: "SALE", quantity: 2 }

API Contract
POST /sync
Endpoint: http://localhost:3000/sync

Headers:
Content-Type: application/json

Request body:

{
  "tenantId": "restaurant_downtown",
  "deviceId": "pos_terminal_01",
  "operations": [
    {
      "operationId": "op_restock_coke_001",
      "itemId": "item_coke_12oz",
      "type": "RESTOCK",
      "quantity": 100,
      "sequenceNumber": 1,
      "timestamp": "2026-05-30T10:00:00.000Z"
    }
  ]
}

Field Descriptions:

Field	                             Type	                 Required	                          Description
tenantId	                         string	                  Yes	                          Unique identifier for the restaurant/location
deviceId	                         string	                  Yes	                          Unique identifier for the POS device
operations	                         array	                  Yes	                          Batch of operations to sync
operationId	                         string	                  Yes	                          Unique client-generated ID (idempotency key)
itemId	                             string	                  Yes	                          Product/SKU identifier
type	                             enum	                  Yes	                          RESTOCK, SALE, WASTE, ADJUSTMENT
quantity	                         integer	              Yes	                          Positive for RESTOCK, positive input for SALE/WASTE (converted to negative internally)
sequenceNumber	                     integer	              Yes	                          Monotonically increasing per-device order
timestamp	                         string                   Yes	                          ISO 8601 timestamp of when operation occurred

Response body:


{
  "accepted": [
    {
      "operationId": "op_restock_coke_001",
      "status": "ACCEPTED"
    }
  ],
  "rejected": [
    {
      "operationId": "op_sale_conflict_003",
      "status": "REJECTED",
      "reason": "INSUFFICIENT_STOCK: current stock 75, requested change -200"
    }
  ],
  "duplicates": [
    {
      "operationId": "op_restock_coke_001",
      "status": "DUPLICATE_SKIPPED"
    }
  ]
}


Status Codes:

Code	                  Description
200	                      Sync completed successfully
400	                      Validation error (missing fields, invalid type)
500	                      Internal server error


Operation Types:

Type	                       Quantity Behavior	                                       Use Case	                             Example

RESTOCK	                       Positive only	                                     Adding inventory from supplier	            quantity: 100

SALE	                   Positive input, stored as negative	                     Customer purchase	                       quantity: 2 (reduces stock by 2)

WASTE	                   Positive input, stored as negative	                     Expired/damaged items	                   quantity: 5 (removes 5 items)

ADJUSTMENT	               Positive or negative	                                     Manual inventory correction	           quantity: -2 or quantity: 3

Database Schema
Core Tables:

Table	                                                  Purpose	                               Key Fields

task1_inventory_items	                              Master item catalog	                  id, tenantId, sku, name

task1_inventory_movements	                    Immutable event store (source of truth)	      operationId, itemId, type, quantity

task1_processed_operations	                            Idempotency keys	                  operationId, tenantId, deviceId

task1_sync_operations	                           Audit log of all sync attempts	          operationId, status, reason


Key Indexes (Performance Optimized)
sql:

-- Tenant-scoped queries (high selectivity)
CREATE INDEX idx_inventory_items_tenant ON task1_inventory_items(tenant_id);

-- Fast stock calculation for specific items
CREATE INDEX idx_movements_item ON task1_inventory_movements(item_id);

-- Idempotency lookup
CREATE INDEX idx_processed_operations ON task1_processed_operations(operation_id);

-- Audit log by time
CREATE INDEX idx_sync_operations_timestamp ON task1_sync_operations(synced_at);


Testing Summary:

Test Case	                                                            Description	                                              Result
Clean Sync - Multiple Items	                                      Batch restock of 3 different items	                         ✅ Passed
Mixed Operations	                                              Sale before restock (sequence ordering)	                     ✅ Passed
Partial Success	                                                  Some accepted, some rejected	                                 ✅ Passed
Waste & Adjustment	                                              Special operation types	                                     ✅ Passed
Tenant Isolation	                                              Different tenants, same item ID	                             ✅ Passed
Large Quantities	                                              1,000,000+ unit operations	                                 ✅ Passed
Zero Quantity Validation	                                      RESTOCK with quantity 0	                                     ✅ Rejected
Invalid Operation Type	                                          Unknown type value	                                         ✅ 400 Error
Missing Required Fields	                                          Missing itemId, timestamp	                                     ✅ 400 Error
Concurrent Devices	                                              Two POS devices on same item	                                 ✅ Conflict detected
Out-of-Sequence Processing	                                      Operations processed by sequenceNumber	                     ✅ Passed
Idempotency	                                                      Duplicate operation prevention	                             ✅ Passed


Running Task 1
Prerequisites
Node.js 18+

PostgreSQL 16+ (or Docker)

npm or yarn

Setup
bash
# Install dependencies
npm install

# Create .env file
echo 'DATABASE_URL="postgresql://postgres:postgres@localhost:5432/bake_assessment"' > .env
echo 'PORT=3000' >> .env

# Start PostgreSQL (Docker)
docker-compose up -d

# Run migrations
npm run prisma:migrate

# Generate Prisma client
npm run prisma:generate

# Start the server
npm run start:dev
Verify Installation
bash
# Health check
curl http://localhost:3000/health

# Swagger documentation
open http://localhost:3000/api

# Run tests
npm test



Tradeoffs & Decisions

Chosen: Event Sourcing
Aspect	Decision
Pro	Complete audit trail, no data loss, easier debugging
Con	Requires event replay for stock calculation
Mitigation	Can add materialized views for performance if needed


Chosen: Server-Validated Conflict Resolution
Aspect	Decision
Pro	Deterministic, prevents negative inventory
Con	Rejected operations must be retried by client
Rationale	POS systems prioritize inventory accuracy over convenience


Chosen: Global Idempotency Scope
Aspect	Decision
Pro	Prevents cross-tenant replay attacks (security)
Con	Different tenants cannot reuse same operationId
Mitigation	Clients should use tenant-prefixed IDs (e.g., tenantA_op123)


Chosen: Sequence Numbers for Ordering
Aspect	Decision
Pro	Deterministic ordering even with clock skew
Con	Client must maintain sequence counter
Rationale	Timestamps alone are unreliable across offline devices

Future Improvements (Given More Time)

Snapshot-based sync - Reduce replay of full history for large inventories

WebSocket real-time sync - Push inventory updates to connected devices

Vector clocks - More sophisticated conflict detection for complex scenarios

Kafka event streaming - Scale to thousands of concurrent devices

Materialized stock views - Optimize read performance for frequent queries

Batch size limits - Prevent oversized request payloads

Retry with backoff - Client guidance for rejected operations

Monitoring & Observability
Structured Logging Example

json
{
  "message": "Sync completed",
  "tenantId": "restaurant_123",
  "deviceId": "pos_001",
  "totalOperations": 3,
  "accepted": 2,
  "rejected": 1,
  "duplicates": 0,
  "durationMs": 45
}

Health Check Endpoint

GET /health
Response:

json
{
  "status": "healthy",
  "database": "connected",
  "timestamp": "2026-05-30T15:21:47.432Z"
}


File Structure
text
src/modules/sync/
├── controllers/
│   ├── sync.controller.ts      # POST /sync endpoint
│   └── health.controller.ts    # GET /health endpoint
├── services/
│   ├── sync.service.ts         # Core sync logic
│   ├── conflict-resolution.service.ts  # Conflict detection & resolution
│   └── inventory-projection.service.ts # Stock calculation
├── dto/
│   ├── sync-request.dto.ts     # Request validation
│   ├── sync-response.dto.ts    # Response structure
│   └── sync-operation.dto.ts   # Operation schema
└── tests/
    ├── clean-sync.spec.ts      # Happy path tests
    ├── conflict-scenario.spec.ts # Conflict tests
    └── idempotency.spec.ts     # Idempotency tests


Troubleshooting
Common Issues
Issue	Solution
Error: P1001: Can't reach database server	Ensure PostgreSQL is running: docker-compose up -d
Error: Foreign key constraint violated	Item doesn't exist - should auto-create, check logs
Error: Unique constraint failed on operationId	Idempotency working correctly - duplicate operation
Port 3000 already in use	Change PORT in .env or kill process: lsof -ti:3000 | xargs kill -9





Database Schema
Tables

Table	                                            Purpose
inventory_items	                                    Master item catalog
inventory_movements	                                Immutable event store (source of truth)
processed_operations	                            Idempotency keys
sync_operations	                                    Audit log of all sync attempts

Key Indexes
sql
-- Performance optimization for tenant-scoped queries
CREATE INDEX idx_inventory_items_tenant ON inventory_items(tenant_id);

-- Fast stock calculation
CREATE INDEX idx_movements_item ON inventory_movements(item_id);


Operation Types:

Type	                                      Quantity Behavior	                            Use Case
RESTOCK	                                      Positive only	                                Adding inventory
SALE	                                      Positive input, stored as negative	        Customer purchase
WASTE	                                      Positive input, stored as negative	        Expired/damaged items
ADJUSTMENT	                                  Positive or negative	                        Manual correction


Testing Summary
Test Case	                                                        Result
Clean sync - multiple items	                                        ✅ Passed
Mixed operations (sale before restock)	                            ✅ Passed
Partial success (some rejected)	                                    ✅ Passed
Waste and adjustment operations	                                    ✅ Passed
Tenant isolation	                                                ✅ Passed
Large quantities	                                                ✅ Passed
Zero quantity validation	                                        ✅ Passed
Invalid operation type	                                            ✅ 400 Error
Concurrent device conflict	                                        ✅ Passed
Out-of-sequence processing	                                        ✅ Passed
Idempotency (duplicate prevention)	                                ✅ Passed



Task 2: Multi-Tenant Inventory API

Overview
A production-grade multi-tenant inventory management system for restaurant chains. Each tenant (location) manages its own stock independently, while parent accounts can query aggregate views across all locations. Built with NestJS, PostgreSQL, Prisma, and TypeScript.

Architecture Decision: Data-Layer Tenant Isolation
Critical Requirement: Tenant isolation is enforced at the data layer, not just the application layer.

Implementation
Every table includes a tenantId column, and all queries automatically filter by tenant ID:

sql
-- Every query includes tenant isolation
SELECT * FROM inventory_items WHERE tenant_id = 'current_tenant_id'
Row-Level Security (RLS) Ready
The schema is designed for PostgreSQL RLS, which can be enabled in production:

sql
ALTER TABLE task2_inventory_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON task2_inventory_items
  USING (tenant_id = current_setting('app.current_tenant_id'));

API Endpoints
Base URL: http://localhost:3000/inventory

Required Headers:

Header	                              Required	                                           Description
x-tenant-id	                          ✅ Yes	                                 Tenant ID for all operations (except aggregate)
x-parent-tenant-id	                  ✅ Yes	                                 Parent tenant ID for aggregate queries

Endpoint Reference
1. Create Inventory Item
POST /inventory/items

Request Body:

{
  "locationId": "uuid",
  "sku": "COKE-12OZ",
  "name": "Coca Cola 12oz",
  "description": "Carbonated soft drink",
  "unitPrice": 150,
  "minThreshold": 10
}

Field	                                               Type	                                 Required	                                    Description
locationId	                                           UUID	                                   Yes	                                        Location ID where item is stored
sku	                                                   string	                               Yes	                                        Stock Keeping Unit (unique per location)
name	                                               string	                               Yes	                                        Display name
description	                                           string	                               No	                                        Optional description
unitPrice	                                           integer	                               No	                                        Price in cents ($1.50 = 150)
minThreshold	                                       integer	                               No	                                        Low-stock alert threshold (default: 5)

Response: 201 Created

{
  "id": "uuid",
  "tenantId": "uuid",
  "locationId": "uuid",
  "sku": "COKE-12OZ",
  "name": "Coca Cola 12oz",
  "unitPrice": 150,
  "minThreshold": 10,
  "createdAt": "2026-01-01T00:00:00.000Z"
}

2. List Inventory Items
GET /inventory/items

Query Parameters:

Parameter	                                         Required	                         Description
locationId	                                          No	                             Filter by specific location

Response: 200 OK

[
  {
    "id": "uuid",
    "sku": "COKE-12OZ",
    "name": "Coca Cola 12oz",
    "currentStock": 100,
    "isLowStock": false,
    "minThreshold": 10,
    "location": {
      "id": "uuid",
      "name": "Downtown Restaurant"
    },
    "movements": [...]
  }
]

3. Get Single Inventory Item
GET /inventory/items/{id}

Response: 200 OK with full item details including movement history

4. Update Inventory Item
PUT /inventory/items/{id}

Request Body:

{
  "name": "New Name",
  "unitPrice": 175,
  "minThreshold": 15
}

Response: 200 OK with updated item

5. Delete Inventory Item
DELETE /inventory/items/{id}

Response: 204 No Content

6. Record Stock Movement
POST /inventory/movements

Movement Types:

SALE - Customer purchase (reduces stock)

RESTOCK - Supplier delivery (increases stock)

WASTE - Expired/damaged (reduces stock)

TRANSFER_IN - Receive from another location (increases)

TRANSFER_OUT - Send to another location (reduces)

Request Body:

{
  "locationId": "uuid",
  "itemId": "uuid",
  "type": "SALE",
  "quantity": 5,
  "referenceId": "ORDER-12345",
  "notes": "Customer walk-in sale"
}

Field	                                           Type	                          Required	                                      Description
locationId	                                       UUID	                           Yes	                                          Location where movement occurred
itemId	                                           UUID	                           Yes	                                          Item being moved
type	                                           enum	                           Yes	                                          SALE, RESTOCK, WASTE, TRANSFER_IN, TRANSFER_OUT
quantity	                                       integer	                       Yes	                                          Positive integer (sign handled automatically)
referenceId	                                       string	                       No	                                          Order ID, PO number, transfer ID
notes	                                           string	                       No	                                          Additional context

Response: 201 Created

{
  "id": "uuid",
  "type": "SALE",
  "quantity": -5,
  "createdAt": "2026-01-01T00:00:00.000Z"
}

Important: Quantity sign is handled automatically:

SALE, WASTE, TRANSFER_OUT → stored as negative

RESTOCK, TRANSFER_IN → stored as positive

7. Get Current Stock
GET /inventory/stock/{itemId}

Response: 200 OK

{
  "itemId": "uuid",
  "currentStock": 95
}
8. Get Stock by Location
GET /inventory/locations/{locationId}/stock

Response: 200 OK

[
  {
    "id": "uuid",
    "sku": "COKE-12OZ",
    "name": "Coca Cola 12oz",
    "currentStock": 95,
    "minThreshold": 10,
    "isLowStock": false
  }
]

9. Aggregate Across Locations (Parent Account)
GET /inventory/aggregate

Query Parameters:

Parameter	                                                    Required	                                  Description
parentTenantId	                                                Yes	                                          Parent tenant ID for aggregation
skus[]	                                                        No	                                          Filter by specific SKUs (can repeat)

Response: 200 OK

[
  {
    "sku": "COKE-12OZ",
    "name": "Coca Cola 12oz",
    "totalStock": 145,
    "locations": {
      "downtown-location-id": 95,
      "uptown-location-id": 50
    }
  }
]

Database Schema
Tables

Table	                                                             Purpose
task2_tenants	                                            Parent/child tenant hierarchy
task2_locations	                                            Physical restaurant locations
task2_inventory_items	                                    Product catalog with stock thresholds
task2_stock_movements	                                    Immutable movement ledger

Entity Relationships

Tenant (1) ──< (N) Location
Location (1) ──< (N) InventoryItem
InventoryItem (1) ──< (N) StockMovement

Key Constraints
SKU is unique per (tenantId, locationId)

tenantId on every table for isolation

Foreign key cascades maintain referential integrity

Database Indexes
Index 1: Tenant + SKU Lookup

sql
CREATE INDEX idx_inventory_tenant_sku ON task2_inventory_items(tenant_id, sku);
Why: Most queries filter by tenant_id first, then by sku for product lookups. This composite index provides optimal performance.

Index 2: Location + Time Range

sql
CREATE INDEX idx_movements_location_time ON task2_stock_movements(location_id, created_at);
Why: Parent accounts frequently query movement history by location and date range for reporting.

Index 3: Low-Stock Alert Queries

sql
CREATE INDEX idx_items_low_stock ON task2_inventory_items(tenant_id, min_threshold);
Why: Background workers query items where currentStock <= minThreshold. This index accelerates low-stock detection.

Structured Logging
Every request produces structured logs for observability:

{
  "requestId": "1735567890123-abc123",
  "tenantId": "15efc240-5974-4fc7-9a7d-91bd81864186",
  "method": "POST",
  "url": "/inventory/movements",
  "statusCode": 201,
  "latencyMs": 45,
  "outcome": "SUCCESS"
}

Logging Features:

Unique request ID for tracing

Tenant ID for multi-tenant debugging

Latency measurement for performance monitoring

Outcome classification (SUCCESS/FAILURE)

Low-Stock Alerts Extension Plan
To extend this service for low-stock alerts across tenants:

1. Alert Table Schema

sql
CREATE TABLE low_stock_alerts (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  location_id UUID NOT NULL,
  item_id UUID NOT NULL,
  current_stock INT NOT NULL,
  threshold INT NOT NULL,
  triggered_at TIMESTAMP NOT NULL,
  resolved_at TIMESTAMP,
  notified BOOLEAN DEFAULT FALSE
);

2. Background Worker (Cron Job)
typescript
@Injectable()
export class LowStockWorker {
  @Cron('*/5 * * * *') // Every 5 minutes
  async checkLowStock() {
    const items = await this.prisma.inventoryItem2.findMany({
      where: {
        currentStock: { lte: this.prisma.inventoryItem2.fields.minThreshold }
      }
    });
    
    for (const item of items) {
      await this.createAlert(item);
      await this.sendNotification(item);
    }
  }
}

3. Notification Channels
Channel	                                          Method	                       Use Case
Webhook	                                         HTTP POST	                     Integration with POS systems
Email	                                         SMTP	                         Manager notifications
Slack	                                         Webhook	                     Team alerts

4. Parent Dashboard Endpoints
typescript
GET /inventory/alerts/low-stock?tenantId={id}
GET /inventory/alerts/resolved?from={date}
POST /inventory/alerts/acknowledge/{id}

5. Implementation Priority
Add last_alert_sent_at to InventoryItem table

Create background worker with @nestjs/schedule

Implement webhook delivery with retry logic

Add parent dashboard endpoints

Configure notification preferences per tenant

Testing Summary:

Unit Tests:
npm test -- inventory.service.spec.ts
npm test -- aggregate.service.spec.ts

E2E Tests:
npm test -- inventory.e2e-spec.ts


Test Coverage
Category	                          Tests	                           Status
CRUD Operations	                       8	                            ✅
Stock Movements	                       6	                            ✅
Aggregation	                           2	                            ✅ 
Tenant Isolation	                   2	                            ✅
Validation	                           2	                            ✅

Running Task 2
Prerequisites
Task 1 setup complete (PostgreSQL running, migrations applied)

Seed data created

Setup
bash
# Run migrations (already done in Task 1)
npm run prisma:migrate

# Generate Prisma client
npm run prisma:generate

# Seed test data
npm run prisma:seed

# Start the server
npm run start:dev
Verify Installation
bash
# Health check
curl http://localhost:3000/health

# List all items (using your tenant ID)
curl -X GET "http://localhost:3000/inventory/items" \
  -H "x-tenant-id: YOUR_TENANT_ID"

# Swagger documentation
open http://localhost:3000/api

## API Endpoints (No root /inventory endpoint)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/inventory/items` | GET | List inventory items |
| `/inventory/items` | POST | Create new item |
| `/inventory/items/:id` | GET | Get single item |
| `/inventory/items/:id` | PUT | Update item |
| `/inventory/items/:id` | DELETE | Delete item |
| `/inventory/movements` | POST | Record stock movement |
| `/inventory/stock/:itemId` | GET | Get current stock |
| `/inventory/locations/:locationId/stock` | GET | Get stock by location |
| `/inventory/aggregate` | GET | Aggregate across locations |


Tradeoffs & Decisions:

Chosen: Explicit tenantId on Every Table:
Aspect	                        Decision
Pro	                            Clear isolation, simple queries, RLS-ready
Con	                            Slightly larger storage, every query needs filter
Rationale	                    Security > storage optimization

Chosen: Event-Based Stock Calculation:
Aspect	                        Decision
Pro	                            Complete audit trail, no data loss, easy debugging
Con	                            Requires SUM() aggregation for current stock
Mitigation	                    Can add materialized views for read-heavy workloads

Chosen: REST over GraphQL:
Aspect	                        Decision
Pro	                            Simpler, better caching, familiar to most developers
Con	                            Over-fetching possible for complex queries
Rationale	                    Assessment requirements preferred REST

Future Improvements (Given More Time):
Real-time WebSocket updates - Push stock changes to connected POS devices

Materialized stock views - Cache current stock for faster reads

Batch movement API - Record multiple movements in one request

Webhook delivery with retry - Reliable low-stock notifications

Export reports (CSV/PDF) - Daily inventory reports for managers

Transfer approval workflow - Multi-step location-to-location transfers

Redis caching - Cache frequently accessed inventory items

Troubleshooting:

Issue	Solution
Error: Location not found	Verify locationId belongs to the tenant in x-tenant-id
Error: Item not found	Check item exists and belongs to tenant
GET /inventory/aggregate returns empty	Ensure x-parent-tenant-id header is set
Stock calculation incorrect	Check movement types and quantities in database
Tenant isolation failing	Verify tenantId is set on all queries

