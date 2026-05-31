import { Module } from '@nestjs/common';
import { PaymentController } from './controllers/payment.controller';
import { PaymentService } from './services/payment.service';
import { ReconciliationService } from './services/reconciliation.service';
import { MockPaymentProvider } from './services/mock-provider.service';

@Module({
  controllers: [PaymentController],
  providers: [PaymentService, ReconciliationService, MockPaymentProvider],
  exports: [PaymentService],
})
export class PaymentModule {}