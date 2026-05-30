# Bake Platform Assessment

Task 1: Offline-First Sync Engine
Overview
A production-grade offline-first inventory sync engine that enables POS devices to operate offline and synchronize inventory changes when connectivity is restored.

Architecture Decision: Event-Based Inventory Movements
Instead of storing mutable stock quantities, we store immutable inventory events:

SALE -2
RESTOCK +5
WASTE -1

Why this approach:

✅ Complete audit trail

✅ No silent data loss

✅ Easier reconciliation

✅ Distributed-system safe

✅ Deterministic conflict resolution

Conflict Resolution Strategy: Server-Validated Event Merging:

Strategy	                               Pros	                            Cons	               Our Choice
Last-Write-Wins	                           Simple	                        Data loss risk	         ❌

CRDTs	                                   No data loss	                    Complex, overkill        ❌

Server Wins	                               Authoritative	                Client UX degrades       ❌

Event-based + Validation	               Audit trail, deterministic	    Requires event replay	 ✅



How it works:

- All operations stored as immutable events

- Server validates each operation against current projected state

- Operations causing negative inventory are REJECTED

- Sequence numbers ensure deterministic ordering

- Timestamp as tie-breaker when sequence numbers equal

Idempotency Design
Problem: Network failures cause retries → duplicate charges/inventory changes

Solution:

Each operation has unique operationId (client-generated)

Server stores processed_operations table

Duplicate operations return DUPLICATE_SKIPPED status

Idempotency Scope: Per-tenant + operationId (different tenants can reuse same IDs)

API Contract
POST /sync
Request:

json
{
  "tenantId": "restaurant_123",
  "deviceId": "pos_device_001",
  "operations": [
    {
      "operationId": "op_001",
      "itemId": "item_coke",
      "type": "RESTOCK",
      "quantity": 100,
      "sequenceNumber": 1,
      "timestamp": "2026-05-30T10:00:00.000Z"
    }
  ]
}

Response:

json
{
  "accepted": [
    {"operationId": "op_001", "status": "ACCEPTED"}
  ],
  "rejected": [
    {
      "operationId": "op_002",
      "status": "REJECTED",
      "reason": "INSUFFICIENT_STOCK: current stock 75, requested change -200"
    }
  ],
  "duplicates": [
    {"operationId": "op_001", "status": "DUPLICATE_SKIPPED"}
  ]
}


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


Tradeoffs & Decisions

Chosen: Event Sourcing
Pro: Complete audit trail, no data loss

Con: Requires event replay for stock calculation

Mitigation: Can add materialized views for performance

Chosen: Server-Validated Conflict Resolution
Pro: Deterministic, prevents negative inventory

Con: Rejected operations must be retried by client

Why: POS systems prioritize inventory accuracy over convenience

Chosen: Idempotency by operationId
Pro: Simple, effective

Con: Client must generate unique IDs

Why: Standard pattern, works across network retries

Future Improvements (Given More Time)

Snapshot-based sync - Reduce replay of full history

WebSocket real-time sync - Push updates to connected devices

Vector clocks - More sophisticated conflict detection

Kafka event streaming - Scale to thousands of devices

Materialized stock views - Optimize read performance
