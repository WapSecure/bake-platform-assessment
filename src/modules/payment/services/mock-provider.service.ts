import { Injectable, Logger } from '@nestjs/common';

export interface ProviderResponse {
  success: boolean;
  transactionId?: string;
  error?: string;
  errorType?: 'timeout' | 'provider_error' | 'network_failure';
}

@Injectable()
export class MockPaymentProvider {
  private readonly logger = new Logger(MockPaymentProvider.name);
  private failureMode: 'none' | 'timeout' | 'error' | 'network' = 'none';

  setFailureMode(mode: 'none' | 'timeout' | 'error' | 'network') {
    this.failureMode = mode;
    this.logger.log(`Failure mode set to: ${mode}`);
  }

  getFailureMode() {
    return this.failureMode;
  }

  async processPayment(amount: number, currency: string, idempotencyKey: string): Promise<ProviderResponse> {
    this.logger.log(`Processing payment: ${amount} ${currency}, key: ${idempotencyKey}`);
    this.logger.log(`Current failure mode: ${this.failureMode}`);

    await this.delay(500);

    if (this.failureMode === 'timeout') {
      this.logger.warn('Simulating provider timeout...');
      await this.delay(3000);
      return {
        success: false,
        error: 'Request timeout after 3 seconds',
        errorType: 'timeout',
      };
    }

    if (this.failureMode === 'network') {
      this.logger.warn('Simulating network failure...');
      return {
        success: false,
        error: 'Network connection failed',
        errorType: 'network_failure',
      };
    }

    if (this.failureMode === 'error') {
      this.logger.warn('Simulating provider error...');
      return {
        success: false,
        error: 'Provider error: Insufficient funds',
        errorType: 'provider_error',
      };
    }

    return {
      success: true,
      transactionId: `txn_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`,
    };
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}