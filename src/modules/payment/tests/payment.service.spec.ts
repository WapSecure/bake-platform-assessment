import { Test, TestingModule } from '@nestjs/testing';
import { PaymentService } from '../services/payment.service';
import { MockPaymentProvider } from '../services/mock-provider.service';
import { PrismaService } from '../../../../prisma/prisma.service';

const mockPrismaService = {
  paymentRequest: {
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    findMany: jest.fn(),
  },
  paymentEvent: {
    create: jest.fn(),
  },
};

const mockProvider = {
  setFailureMode: jest.fn(),
  getFailureMode: jest.fn(),
  processPayment: jest.fn(),
};

describe('PaymentService', () => {
  let service: PaymentService;

  beforeEach(async () => {
    jest.clearAllMocks();
    
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: MockPaymentProvider, useValue: mockProvider },
      ],
    }).compile();

    service = module.get<PaymentService>(PaymentService);
  });

  describe('Idempotency - Requirement 1', () => {
    it('should return existing payment for duplicate request (no double-charge)', async () => {
      const existingPayment = {
        id: 'pay_123',
        orderId: 'order_001',
        tenantId: 'tenant_001',
        status: 'CONFIRMED',
        amount: 5000,
        providerId: 'txn_123',
      };

      mockPrismaService.paymentRequest.findUnique.mockResolvedValue(existingPayment);

      const result = await service.initiatePayment({
        orderId: 'order_001',
        tenantId: 'tenant_001',
        amount: 5000,
      });

      expect(result.status).toBe('CONFIRMED');
      expect(result.paymentId).toBe('pay_123');
      expect(mockPrismaService.paymentRequest.create).not.toHaveBeenCalled();
    });

    it('should create new payment for first-time request', async () => {
      mockPrismaService.paymentRequest.findUnique.mockResolvedValue(null);
      mockPrismaService.paymentRequest.create.mockResolvedValue({
        id: 'pay_new',
        orderId: 'order_002',
        tenantId: 'tenant_001',
        amount: 5000,
        status: 'INITIATED',
      });
      mockPrismaService.paymentEvent.create.mockResolvedValue({});
      mockPrismaService.paymentRequest.update.mockResolvedValue({});
      mockProvider.processPayment.mockResolvedValue({
        success: true,
        transactionId: 'txn_new',
      });

      const result = await service.initiatePayment({
        orderId: 'order_002',
        tenantId: 'tenant_001',
        amount: 5000,
      });

      expect(result.status).toBe('CONFIRMED');
      expect(mockPrismaService.paymentRequest.create).toHaveBeenCalled();
    });
  });

  describe('Failure Mode: Provider Timeout - Requirement 2', () => {
    it('should handle provider timeout failure', async () => {
      mockPrismaService.paymentRequest.findUnique.mockResolvedValue(null);
      mockPrismaService.paymentRequest.create.mockResolvedValue({
        id: 'pay_timeout',
        orderId: 'order_timeout',
        tenantId: 'tenant_001',
        amount: 5000,
        status: 'INITIATED',
      });
      mockPrismaService.paymentEvent.create.mockResolvedValue({});
      mockPrismaService.paymentRequest.update.mockResolvedValue({});
      mockProvider.processPayment.mockResolvedValue({
        success: false,
        error: 'Request timeout after 3 seconds',
        errorType: 'timeout',
      });

      const result = await service.initiatePayment({
        orderId: 'order_timeout',
        tenantId: 'tenant_001',
        amount: 5000,
      });

      expect(result.status).toBe('FAILED_TIMEOUT');
      expect(result.message).toContain('timeout');
    });
  });

  describe('Failure Mode: Provider Error - Requirement 2', () => {
    it('should handle provider error response', async () => {
      mockPrismaService.paymentRequest.findUnique.mockResolvedValue(null);
      mockPrismaService.paymentRequest.create.mockResolvedValue({
        id: 'pay_error',
        orderId: 'order_error',
        tenantId: 'tenant_001',
        amount: 5000,
        status: 'INITIATED',
      });
      mockPrismaService.paymentEvent.create.mockResolvedValue({});
      mockPrismaService.paymentRequest.update.mockResolvedValue({});
      mockProvider.processPayment.mockResolvedValue({
        success: false,
        error: 'Provider error: Insufficient funds',
        errorType: 'provider_error',
      });

      const result = await service.initiatePayment({
        orderId: 'order_error',
        tenantId: 'tenant_001',
        amount: 5000,
      });

      expect(result.status).toBe('FAILED_PROVIDER_ERROR');
      expect(result.message).toContain('Insufficient funds');
    });
  });

  describe('Failure Mode: Network Failure - Requirement 2', () => {
    it('should handle network failure', async () => {
      mockPrismaService.paymentRequest.findUnique.mockResolvedValue(null);
      mockPrismaService.paymentRequest.create.mockResolvedValue({
        id: 'pay_network',
        orderId: 'order_network',
        tenantId: 'tenant_001',
        amount: 5000,
        status: 'INITIATED',
      });
      mockPrismaService.paymentEvent.create.mockResolvedValue({});
      mockPrismaService.paymentRequest.update.mockResolvedValue({});
      mockProvider.processPayment.mockResolvedValue({
        success: false,
        error: 'Network connection failed',
        errorType: 'network_failure',
      });

      const result = await service.initiatePayment({
        orderId: 'order_network',
        tenantId: 'tenant_001',
        amount: 5000,
      });

      expect(result.status).toBe('FAILED_NETWORK');
      expect(result.message).toContain('Network');
    });
  });

  describe('Payment Event Log - Requirement 3', () => {
    it('should persist payment events for audit trail', async () => {
      mockPrismaService.paymentRequest.findUnique.mockResolvedValue(null);
      mockPrismaService.paymentRequest.create.mockResolvedValue({
        id: 'pay_audit',
        orderId: 'order_audit',
        tenantId: 'tenant_001',
        amount: 5000,
        status: 'INITIATED',
      });
      mockPrismaService.paymentEvent.create.mockResolvedValue({});
      mockPrismaService.paymentRequest.update.mockResolvedValue({});
      mockProvider.processPayment.mockResolvedValue({
        success: true,
        transactionId: 'txn_audit',
      });

      await service.initiatePayment({
        orderId: 'order_audit',
        tenantId: 'tenant_001',
        amount: 5000,
      });

      // Should have created at least 3 events: INITIATED, PROVIDER_CALLED, PROVIDER_RESPONSE
      expect(mockPrismaService.paymentEvent.create).toHaveBeenCalledTimes(3);
    });
  });

  describe('Get Payment Status - Requirement 4', () => {
    it('should return payment with event history', async () => {
      const mockPayment = {
        id: 'pay_status',
        orderId: 'order_status',
        status: 'CONFIRMED',
        amount: 5000,
        events: [
          { eventType: 'INITIATED', createdAt: new Date() },
          { eventType: 'CONFIRMED', createdAt: new Date() },
        ],
      };

      mockPrismaService.paymentRequest.findUnique.mockResolvedValue(mockPayment);

      const result = await service.getPaymentStatus('pay_status');

      expect(result.id).toBe('pay_status');
      expect(result.events).toHaveLength(2);
    });

    it('should throw error for non-existent payment', async () => {
      mockPrismaService.paymentRequest.findUnique.mockResolvedValue(null);

      await expect(service.getPaymentStatus('non_existent')).rejects.toThrow('Payment not found');
    });
  });
});