import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { InventoryController } from './controllers/inventory.controller';
import { InventoryService } from './services/inventory.service';
import { AggregateService } from './services/aggregate.service';
import { LoggingInterceptor } from '../../shared/interceptors/logging.interceptor';

@Module({
  controllers: [InventoryController],
  providers: [
    InventoryService,
    AggregateService,
    {
      provide: APP_INTERCEPTOR,
      useClass: LoggingInterceptor,
    },
  ],
  exports: [InventoryService],
})
export class InventoryModule {}