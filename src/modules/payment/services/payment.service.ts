import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';
import { MockPaymentProvider } from './mock-provider.service';
import { InitiatePaymentDto } from '../dto/initiate-payment.dto';
import { PaymentResponseDto } from '../dto/payment-response.dto';

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly provider: MockPaymentProvider,
  ) {}

  async initiatePayment(dto: InitiatePaymentDto): Promise<PaymentResponseDto> {
    const startTime = Date.now();
    const { orderId, tenantId, amount, currency = 'NGN' } = dto;
    const idempotencyKey = `${tenantId}_${orderId}`;

    this.logger.log(`Initiating payment for order ${orderId}, amount ${amount} ${currency}`);

    const existingPayment = await this.prisma.paymentRequest.findUnique({
      where: { idempotencyKey },
    });

    if (existingPayment) {
      this.logger.log(`Duplicate payment request for order ${orderId}, returning existing status`);
      return {
        paymentId: existingPayment.id,
        orderId: existingPayment.orderId,
        status: existingPayment.status,
        amount: existingPayment.amount,
        providerReference: existingPayment.providerId || undefined,
        message: `Payment already ${existingPayment.status}`,
      };
    }

    const payment = await this.prisma.paymentRequest.create({
      data: {
        idempotencyKey,
        orderId,
        tenantId,
        amount,
        currency,
        status: 'INITIATED',
      },
    });

    await this.logEvent(payment.id, 'INITIATED', 'INITIATED', { orderId, amount, currency });

    await this.updatePaymentStatus(payment.id, 'PROCESSING');
    await this.logEvent(payment.id, 'PROVIDER_CALLED', 'PROCESSING', { timestamp: new Date().toISOString() });

    try {
      const providerResponse = await this.callProviderWithTimeout(amount, currency, idempotencyKey);

      if (providerResponse.success) {
        await this.updatePaymentStatus(payment.id, 'CONFIRMED', providerResponse.transactionId);
        await this.logEvent(payment.id, 'PROVIDER_RESPONSE', 'CONFIRMED', {
          transactionId: providerResponse.transactionId,
          responseTimeMs: Date.now() - startTime,
        });

        this.logger.log(`Payment confirmed for order ${orderId}, txn: ${providerResponse.transactionId}`);

        return {
          paymentId: payment.id,
          orderId,
          status: 'CONFIRMED',
          amount,
          providerReference: providerResponse.transactionId,
          message: 'Payment successful',
        };
      }

      let status: string;
      let errorMessage: string;

      switch (providerResponse.errorType) {
        case 'timeout':
          status = 'FAILED_TIMEOUT';
          errorMessage = providerResponse.error || 'Provider timeout';
          await this.logEvent(payment.id, 'PROVIDER_TIMEOUT', status, { error: errorMessage });
          break;
        case 'network_failure':
          status = 'FAILED_NETWORK';
          errorMessage = providerResponse.error || 'Network failure';
          await this.logEvent(payment.id, 'FAILED', status, { error: errorMessage });
          break;
        default:
          status = 'FAILED_PROVIDER_ERROR';
          errorMessage = providerResponse.error || 'Provider error';
          await this.logEvent(payment.id, 'FAILED', status, { error: errorMessage });
      }

      await this.updatePaymentStatus(payment.id, status, undefined, errorMessage);
      this.logger.warn(`Payment failed for order ${orderId}: ${errorMessage}`);

      return {
        paymentId: payment.id,
        orderId,
        status,
        amount,
        message: errorMessage,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      await this.updatePaymentStatus(payment.id, 'FAILED_NETWORK', undefined, errorMessage);
      await this.logEvent(payment.id, 'FAILED', 'FAILED_NETWORK', { error: errorMessage });

      return {
        paymentId: payment.id,
        orderId,
        status: 'FAILED_NETWORK',
        amount,
        message: errorMessage,
      };
    }
  }

  private async callProviderWithTimeout(
    amount: number,
    currency: string,
    idempotencyKey: string,
    timeoutMs: number = 5000,
  ): Promise<{ success: boolean; transactionId?: string; error?: string; errorType?: string }> {
    return new Promise(async (resolve) => {
      const timeout = setTimeout(() => {
        resolve({
          success: false,
          error: 'Provider timeout',
          errorType: 'timeout',
        });
      }, timeoutMs);

      try {
        const result = await this.provider.processPayment(amount, currency, idempotencyKey);
        clearTimeout(timeout);
        resolve(result);
      } catch (error) {
        clearTimeout(timeout);
        resolve({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
          errorType: 'network_failure',
        });
      }
    });
  }

  private async updatePaymentStatus(
    paymentId: string,
    status: string,
    providerId?: string,
    errorMessage?: string,
  ) {
    const updateData: any = { status };
    if (providerId) updateData.providerId = providerId;
    if (errorMessage) updateData.errorMessage = errorMessage;
    if (status === 'CONFIRMED') updateData.confirmedAt = new Date();
    if (status === 'REFUNDED') updateData.refundedAt = new Date();

    await this.prisma.paymentRequest.update({
      where: { id: paymentId },
      data: updateData,
    });
  }

  private async logEvent(paymentId: string, eventType: string, status: string, metadata: any) {
    await this.prisma.paymentEvent.create({
      data: {
        paymentId,
        eventType: eventType as any,
        status: status as any,
        metadata,
      },
    });
  }

  async getPaymentStatus(paymentId: string) {
    const payment = await this.prisma.paymentRequest.findUnique({
      where: { id: paymentId },
      include: { events: { orderBy: { createdAt: 'asc' } } },
    });

    if (!payment) {
      throw new NotFoundException('Payment not found');
    }

    return payment;
  }

  async getPaymentByIdempotencyKey(key: string) {
    return this.prisma.paymentRequest.findUnique({
      where: { idempotencyKey: key },
    });
  }

  async getAllPayments(tenantId?: string, limit: number = 50) {
    const where: any = {};
    if (tenantId) {
      where.tenantId = tenantId;
    }

    return this.prisma.paymentRequest.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        events: {
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
      },
    });
  }
}