# Bake Platform Assessment

A production-grade platform assessment implementing:

- **Task 1:** Offline-first sync engine for POS devices
- **Task 2:** Multi-tenant inventory API for restaurant chains
- **Task 3:** Payment reliability layer with idempotency and reconciliation

Built with **NestJS, PostgreSQL, Prisma, TypeScript, and Swagger/OpenAPI**.

## 📋 Table of Contents

- [Technology Stack](#technology-stack)
- [Quick Start](#quick-start)
- [Task 1: Offline-First Sync Engine](#task-1-offline-first-sync-engine)
- [Task 2: Multi-Tenant Inventory API](#task-2-multi-tenant-inventory-api)
- [Task 3: Payment Reliability Layer](#task-3-payment-reliability-layer)
- [Assumptions & Tradeoffs](#assumptions--tradeoffs)
- [Future Improvements](#future-improvements)
- [Troubleshooting](#troubleshooting)

## 🛠 Technology Stack

| Category | Technology |
|----------|------------|
| **Runtime** | Node.js 20+ |
| **Framework** | NestJS 10.x |
| **Language** | TypeScript 5.x |
| **Database** | PostgreSQL 16+ |
| **ORM** | Prisma 5.x |
| **Validation** | class-validator + class-transformer |
| **Documentation** | Swagger/OpenAPI 7.x |
| **Testing** | Jest 29.x |
| **Logging** | Structured JSON logging |

## 🚀 Quick Start

### Prerequisites

```bash
# Required versions
Node.js >= 20.0.0
PostgreSQL >= 16.0 (or Docker)
npm >= 9.0.0

Installation:

# Clone the repository
git clone https://github.com/WapSecure/bake-platform-assessment.git
cd bake-platform-assessment

# Install dependencies
npm install

# Create environment file
cp .env.example .env

# Start PostgreSQL (Docker)
docker-compose up -d

# Run database migrations
npm run prisma:migrate

# Generate Prisma client
npm run prisma:generate

# Seed test data for Task 2
npm run prisma:seed

# Start the development server
npm run start:dev


Verify Installation:

# Health check
curl http://localhost:3000/health

# Open Swagger documentation
open http://localhost:3000/api

# Run all tests
npm test

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


Task 3: Payment Reliability Layer

Overview:
A production-grade payment processing wrapper that ensures never double-charge, handles payment provider failures gracefully, and maintains a complete audit trail for reconciliation. Built with NestJS, PostgreSQL, Prisma, and TypeScript.

Key Features:

✅ Idempotent payment initiation - Same order cannot be charged twice

✅ Three failure mode handling - Timeout, provider error, network failure

✅ Complete event sourcing - Every state change is logged

✅ Reconciliation engine - Detects discrepancies between provider and internal records

✅ Mock payment provider - No live API keys required for testing

Architecture Decision: State Machine Pattern

Payment State Flow:

┌─────────────┐
│  INITIATED  │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│  PROCESSING │
└──────┬──────┘
       │
       ├──────────────────────────┐
       │                          │
       ▼                          ▼
┌─────────────┐    ┌─────────────────────────────┐
│  CONFIRMED  │    │ FAILED_TIMEOUT              │
└─────────────┘    │ FAILED_PROVIDER_ERROR       │
                   │ FAILED_NETWORK              │
                   └─────────────────────────────┘
       │                          │
       ▼                          │
┌─────────────┐                   │
│  REFUNDED   │◄──────────────────┘
└─────────────┘

Why State Machine Pattern?

Pattern	                           Pros	                                 Cons	                                       Our Choice

Direct API call	                   Simple	                             No audit trail, no recovery	                  ❌

Retry with backoff	               Resilient	                         Can double-charge	                              ❌

Saga Pattern	                   Distributed transaction support	     Complex for simple payments	                  ❌

State Machine + Event Sourcing	   Audit trail, idempotent, recoverable	 Slightly more complex	                          ✅

Idempotency Design
Problem: Network failures cause retries → duplicate charges

Solution:

1. Idempotency key = {tenantId}_{orderId}

2. Server stores payment record before calling provider

3. Duplicate requests return existing payment status

Example:

// First request - CONFIRMED
{ orderId: "order_001", tenantId: "tenant_001", amount: 5000 }

// Second request (retry) - Returns existing status (no new charge)
{ orderId: "order_001", tenantId: "tenant_001", amount: 5000 }
// Response: { status: "CONFIRMED", message: "Payment already CONFIRMED" }

Failure Mode Handling:
Failure Mode	                                         Detection	                                    Action	                         Outcome

Provider Timeout	                                     Request exceeds 5 seconds	                    Mark as FAILED_TIMEOUT	         Client retries with same idempotency key

Provider Error	                                         API returns 4xx/5xx	                        Mark as FAILED_PROVIDER_ERROR	 Manual investigation required

Network Failure	                                         Request fails before reaching provider	        Mark as FAILED_NETWORK	         Client retries with backoff

API Contract
Base URL: http://localhost:3000/payment

Required Headers
None required for Task 3 (tenant ID is in request body for this task)

Endpoint Reference

1. Initiate Payment
POST /payment/initiate

Request Body:

{
  "orderId": "order_001",
  "tenantId": "tenant_001",
  "amount": 5000,
  "currency": "NGN"
}

Field	                         Type	                   Required	              Description
orderId                          string	                   Yes	                  Unique order identifier
tenantId	                     string	                   Yes	                  Tenant making the payment
amount	                         integer	               Yes	                  Amount in cents (5000 = ₦50.00)
currency	                     string	                   No	                  Default: "NGN"


Response (200 OK - Success):

{
  "paymentId": "uuid",
  "orderId": "order_001",
  "status": "CONFIRMED",
  "amount": 5000,
  "providerReference": "txn_1234567890_abc123",
  "message": "Payment successful"
}

Response (200 OK - Duplicate):

{
  "paymentId": "uuid",
  "orderId": "order_001",
  "status": "CONFIRMED",
  "amount": 5000,
  "message": "Payment already CONFIRMED"
}

Response (200 OK - Failure):

{
  "paymentId": "uuid",
  "orderId": "order_002",
  "status": "FAILED_TIMEOUT",
  "amount": 5000,
  "message": "Request timeout after 3 seconds"
}

2. Get Payment Status
GET /payment/status/{paymentId}

Response (200 OK):

{
  "id": "uuid",
  "orderId": "order_001",
  "status": "CONFIRMED",
  "amount": 5000,
  "events": [
    {
      "eventType": "INITIATED",
      "status": "INITIATED",
      "createdAt": "2026-01-01T00:00:00.000Z"
    },
    {
      "eventType": "PROVIDER_CALLED",
      "status": "PROCESSING",
      "createdAt": "2026-01-01T00:00:00.100Z"
    },
    {
      "eventType": "PROVIDER_RESPONSE",
      "status": "CONFIRMED",
      "createdAt": "2026-01-01T00:00:00.500Z"
    }
  ]
}

3. Get All Payments
GET /payment/all

Query Parameters:

Parameter	                      Required	                Description

tenantId	                      No	                    Filter by tenant

limit	                          No	                    Max results (default: 50)

Response (200 OK): Array of payment records

4. Set Failure Mode (Test Only)
POST /payment/test/set-failure-mode?mode={mode}

Modes:

1. none - Normal operation (default)

2. timeout - Simulate provider timeout

3. error - Simulate provider error

4. network - Simulate network failure

Response (200 OK):

{
  "message": "Failure mode set to: timeout",
  "mode": "timeout"
}

5. Get Current Failure Mode (Test Only)
GET /payment/test/failure-mode

Response (200 OK):

{
  "mode": "none"
}

6. Run Reconciliation
POST /payment/reconcile

Request Body:

[
  {
    "id": "txn_provider_001",
    "orderId": "order_001",
    "amount": 5000,
    "status": "SUCCESS",
    "createdAt": "2026-01-01T00:00:00.000Z"
  }
]

Response (200 OK):

{
  "runAt": "2026-01-01T00:00:00.000Z",
  "totalProviderTransactions": 2,
  "totalInternalPayments": 1,
  "discrepancies": [
    {
      "type": "PROVIDER_ONLY",
      "orderId": "order_missing_001",
      "amount": 10000,
      "providerStatus": "SUCCESS",
      "message": "Payment exists in provider but not in our system"
    }
  ],
  "summary": {
    "providerOnly": 1,
    "internalOnly": 0,
    "statusMismatch": 0
  }
}

Discrepancy Types:

Type	                                          Description
PROVIDER_ONLY	                                  Payment exists in provider but not in our system
INTERNAL_ONLY	                                  Payment exists in our system but not in provider
STATUS_MISMATCH	                                  Payment status differs between systems

7. Get Reconciliation History
GET /payment/reconcile/history?limit=10

Response (200 OK): Array of reconciliation logs

8. Get Discrepancies by Type
GET /payment/reconcile/discrepancies/{type}

Response (200 OK): Array of discrepancies of the specified type

Database Schema
Tables

Table	                                                   Purpose

task3_payment_requests	                                   Payment records with idempotency keys
task3_payment_events	                                   Immutable audit trail of all state changes
task3_reconciliation_logs	                               History of reconciliation runs

Payment States:

State	                                                   Description

INITIATED	                                               Payment record created, before provider call
PROCESSING	                                               Provider call in progress
CONFIRMED	                                               Payment successful
FAILED_TIMEOUT	                                           Provider did not respond within timeout
FAILED_PROVIDER_ERROR	                                   Provider returned an error
FAILED_NETWORK	                                           Network error before reaching provider
REFUNDED	                                               Payment was refunded

Event Types:

Event Type	                                               Description

INITIATED	                                               Payment request received
PROVIDER_CALLED	                                           Provider API called
PROVIDER_RESPONSE	                                       Provider response received
PROVIDER_TIMEOUT	                                       Provider timeout occurred
CONFIRMED	                                               Payment confirmed
FAILED	                                                   Payment failed
REFUNDED	                                               Payment refunded

Key Indexes:

-- Idempotency lookup (most critical)
CREATE INDEX idx_payment_idempotency ON task3_payment_requests(idempotency_key);

-- Order lookup
CREATE INDEX idx_payment_order ON task3_payment_requests(order_id);

-- Tenant status queries
CREATE INDEX idx_payment_tenant_status ON task3_payment_requests(tenant_id, status);

-- Reconciliation date range
CREATE INDEX idx_payment_created ON task3_payment_requests(created_at);

-- Event audit trail
CREATE INDEX idx_events_payment_time ON task3_payment_events(payment_id, created_at);

Testing Summary

Test Cases: 

Test Case	                            Description	                                    Result

Successful Payment	                    Normal flow with no failures	                ✅
Idempotency	                            Same order sent twice	                        ✅ No duplicate
Timeout Failure	                        Provider times out	                            ✅ FAILED_TIMEOUT
Provider Error	                        Provider returns error	                        ✅ FAILED_PROVIDER_ERROR
Network Failure                     	Network error	                                ✅ FAILED_NETWORK
Payment Status	                        Retrieve with event history	                    ✅
Reconciliation - Provider Only	        Payment in provider only	                    ✅ Detected
Reconciliation - Internal Only	        Payment in internal only	                    ✅ Detected
Reconciliation - Status Mismatch	    Different statuses	                            ✅ Detected
Audit Trail	                            Complete event log	                            ✅ All events stored

Running Task 3
Prerequisites
Tasks 1 & 2 setup complete

PostgreSQL running

Migrations applied

Setup
# Run migrations (adds Task 3 tables)
npm run prisma:migrate

# Generate Prisma client
npm run prisma:generate

# Start the server
npm run start:dev

# Health check
curl http://localhost:3000/health

# Test successful payment
curl -X POST http://localhost:3000/payment/initiate \
  -H "Content-Type: application/json" \
  -d '{
    "orderId": "test_001",
    "tenantId": "tenant_001",
    "amount": 5000,
    "currency": "NGN"
  }'

# Swagger documentation
open http://localhost:3000/api

Run Tests:

# Run Task 3 specific tests
npm test -- payment.service.spec.ts
npm test -- reconciliation.service.spec.ts
npm test -- mock-provider.service.spec.ts

# Run all tests
npm test

Tradeoffs & Decisions

Chosen: State Machine Pattern:

Aspect	                                                        Decision

Pro	                                                            Complete audit trail, idempotent, recoverable
Con	                                                            More complex than simple API call
Rationale	                                                    Financial systems require auditability

Chosen: Idempotency Key = {tenantId}_{orderId}

Aspect	                                                        Decision

Pro	                                                            Simple, ensures tenant isolation
Con	                                                            Same orderId cannot be reused across tenants
Rationale	                                                    Prevents cross-tenant replay attacks

Chosen: 5 Second Timeout

Aspect	                                                        Decision
Pro	                                                            Balances user experience and provider expectations
Con	                                                            May timeout on slow networks
Rationale	                                                    Standard industry practice for payment APIs

Chosen: No Automatic Retry

Aspect	                                                        Decision
Pro	                                                            Prevents double-charge risk
Con	                                                            Client must handle retry logic
Rationale	                                                    Payment idempotency allows safe client retries

Future Improvements (Given More Time)
1. Automatic retry with exponential backoff - For network failures only

2. Webhook notifications - Async payment confirmations

3. Dead letter queue - Failed payments for manual review

4. Real-time provider status dashboard - Monitor provider health

5. Scheduled reconciliation - Automatic daily reconciliation

6. Refund workflow - Full refund lifecycle management

7. Partial refunds - Support for partial payment reversals

8. Multi-provider support - Paystack, Flutterwave, Stripe

Troubleshooting

Issue	                                                        Solution
Error: Payment not found	                                    Verify paymentId exists
Reconciliation shows no discrepancies	                        Data is consistent - good!
Timeout not triggering	                                        Check failure mode is set to timeout
Duplicate request creates new payment	                        Verify idempotency key format {tenantId}_{orderId}
Events not being logged	                                        Check database connection and PaymentEvent table

File Structure

src/modules/payment/
├── controllers/
│   └── payment.controller.ts      # All payment endpoints
├── services/
│   ├── payment.service.ts         # Core payment logic
│   ├── reconciliation.service.ts  # Reconciliation engine
│   └── mock-provider.service.ts   # Mock payment provider
├── dto/
│   ├── initiate-payment.dto.ts    # Request validation
│   ├── payment-response.dto.ts    # Response structure
│   └── provider-transaction.dto.ts # Provider transaction format
└── tests/
    ├── payment.service.spec.ts    # Payment unit tests
    ├── reconciliation.service.spec.ts # Reconciliation tests
    └── mock-provider.service.spec.ts # Mock provider tests

✅ Assessment Completion Status

Task	                     Status	                    Key Deliverables

Task 1	                     ✅ Complete	               Offline sync engine, conflict resolution, idempotency, tests

Task 2	                     ✅ Complete	               Multi-tenant API, tenant isolation, aggregation, low-stock plan

Task 3	                     ✅ Complete	               Payment idempotency, failure handling, reconciliation, tests


📧 Contact
For any questions regarding this submission, please email me at writewapsecuregmail.com.

© 2026 Bake Platform Assessment | Senior Fullstack Engineering Challenge