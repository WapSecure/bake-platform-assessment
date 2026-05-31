import { Controller, Post, Get, Body, Param, Query, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { PaymentService } from '../services/payment.service';
import { ReconciliationService } from '../services/reconciliation.service';
import { MockPaymentProvider } from '../services/mock-provider.service';
import { InitiatePaymentDto } from '../dto/initiate-payment.dto';
import { PaymentResponseDto } from '../dto/payment-response.dto';
import { ProviderTransactionDto } from '../dto/provider-transaction.dto';

@ApiTags('payment')
@Controller('payment')
export class PaymentController {
  constructor(
    private readonly paymentService: PaymentService,
    private readonly reconciliationService: ReconciliationService,
    private readonly mockProvider: MockPaymentProvider,
  ) {}

  @Post('initiate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Initiate a payment with idempotency' })
  @ApiResponse({ status: 200, description: 'Payment processed', type: PaymentResponseDto })
  async initiatePayment(@Body() dto: InitiatePaymentDto): Promise<PaymentResponseDto> {
    return this.paymentService.initiatePayment(dto);
  }

  @Get('status/:paymentId')
  @ApiOperation({ summary: 'Get payment status and event history' })
  async getPaymentStatus(@Param('paymentId') paymentId: string) {
    return this.paymentService.getPaymentStatus(paymentId);
  }

  @Get('all')
  @ApiOperation({ summary: 'Get all payments (optional tenant filter)' })
  async getAllPayments(@Query('tenantId') tenantId?: string, @Query('limit') limit?: string) {
    return this.paymentService.getAllPayments(tenantId, limit ? parseInt(limit) : 50);
  }

  @Post('test/set-failure-mode')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '[TEST] Set mock provider failure mode' })
  @ApiQuery({ name: 'mode', enum: ['none', 'timeout', 'error', 'network'] })
  setFailureMode(@Query('mode') mode: 'none' | 'timeout' | 'error' | 'network') {
    this.mockProvider.setFailureMode(mode);
    return { message: `Failure mode set to: ${mode}`, mode };
  }

  @Get('test/failure-mode')
  @ApiOperation({ summary: '[TEST] Get current failure mode' })
  getFailureMode() {
    return { mode: this.mockProvider.getFailureMode() };
  }

  @Post('reconcile')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Run reconciliation against provider transactions' })
  async reconcile(@Body() providerTransactions: ProviderTransactionDto[]) {
    const transactions = providerTransactions.map(t => ({
      id: t.id,
      orderId: t.orderId,
      amount: t.amount,
      status: t.status,
      createdAt: new Date(t.createdAt),
    }));
    return this.reconciliationService.reconcile(transactions);
  }

  @Get('reconcile/history')
  @ApiOperation({ summary: 'Get reconciliation history' })
  async getReconciliationHistory(@Query('limit') limit?: string) {
    return this.reconciliationService.getReconciliationHistory(limit ? parseInt(limit) : 10);
  }

  @Get('reconcile/discrepancies/:type')
  @ApiOperation({ summary: 'Get discrepancies by type' })
  async getDiscrepanciesByType(@Param('type') type: string) {
    return this.reconciliationService.getDiscrepanciesByType(type);
  }
}