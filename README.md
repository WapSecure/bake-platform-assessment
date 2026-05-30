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

