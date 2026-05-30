import { Module } from '@nestjs/common';
import { SyncController } from './controllers/sync.controller';
import { HealthController } from './controllers/health.controller';
import { SyncService } from './services/sync.service';
import { InventoryProjectionService } from './services/inventory-projection.service';
import { ConflictResolutionService } from './services/conflict-resolution.service';
import { IdempotencyService } from '../../shared/idempotency/idempotency.service';

@Module({
  controllers: [SyncController, HealthController],
  providers: [
    SyncService,
    InventoryProjectionService,
    ConflictResolutionService,
    IdempotencyService,
  ],
  exports: [SyncService],
})
export class SyncModule {}