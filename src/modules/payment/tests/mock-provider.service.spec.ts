import { Test, TestingModule } from '@nestjs/testing';
import { MockPaymentProvider } from '../services/mock-provider.service';

describe('MockPaymentProvider', () => {
  let service: MockPaymentProvider;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [MockPaymentProvider],
    }).compile();

    service = module.get<MockPaymentProvider>(MockPaymentProvider);
  });

  describe('Normal Operation', () => {
    it('should return success for normal mode', async () => {
      service.setFailureMode('none');
      const result = await service.processPayment(1000, 'NGN', 'key_123');
      
      expect(result.success).toBe(true);
      expect(result.transactionId).toBeDefined();
      expect(result.transactionId).toContain('txn_');
    });
  });

  describe('Timeout Failure Mode', () => {
    it('should return timeout error', async () => {
      service.setFailureMode('timeout');
      const result = await service.processPayment(1000, 'NGN', 'key_123');
      
      expect(result.success).toBe(false);
      expect(result.errorType).toBe('timeout');
      expect(result.error).toContain('timeout');
    });
  });

  describe('Provider Error Failure Mode', () => {
    it('should return provider error', async () => {
      service.setFailureMode('error');
      const result = await service.processPayment(1000, 'NGN', 'key_123');
      
      expect(result.success).toBe(false);
      expect(result.errorType).toBe('provider_error');
      expect(result.error).toContain('Insufficient funds');
    });
  });

  describe('Network Failure Mode', () => {
    it('should return network failure', async () => {
      service.setFailureMode('network');
      const result = await service.processPayment(1000, 'NGN', 'key_123');
      
      expect(result.success).toBe(false);
      expect(result.errorType).toBe('network_failure');
      expect(result.error).toContain('Network connection failed');
    });
  });

  describe('Failure Mode Management', () => {
    it('should set and get failure mode', () => {
      service.setFailureMode('timeout');
      expect(service.getFailureMode()).toBe('timeout');
      
      service.setFailureMode('error');
      expect(service.getFailureMode()).toBe('error');
      
      service.setFailureMode('network');
      expect(service.getFailureMode()).toBe('network');
      
      service.setFailureMode('none');
      expect(service.getFailureMode()).toBe('none');
    });
  });
});