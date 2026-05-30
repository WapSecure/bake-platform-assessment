import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { PrismaModule } from '../prisma/prisma.module';
import { SyncModule } from './modules/sync/sync.module';
import { InventoryModule } from './modules/inventory/inventory.module';
import { PaymentModule } from './modules/payment/payment.module';

@Module({
  imports: [
    LoggerModule.forRoot({
      pinoHttp: {
        quietReqLogger: true,
        transport: process.env.NODE_ENV !== 'production' 
          ? {
              target: 'pino-pretty',
              options: {
                singleLine: true,
                colorize: true,
                levelFirst: true,
                translateTime: 'yyyy-mm-dd HH:MM:ss.l o',
              },
            }
          : undefined,
        level: process.env.LOG_LEVEL || 'info',
      },
    }),
    PrismaModule,
    SyncModule,
    InventoryModule,
    PaymentModule,
  ],
})
export class AppModule {}