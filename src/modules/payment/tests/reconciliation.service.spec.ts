import { Test, TestingModule } from '@nestjs/testing';
import { ReconciliationService, ProviderTransaction } from '../services/reconciliation.service';
import { PrismaService } from '../../../../prisma/prisma.service';

const mockPrismaService = {
  paymentRequest: {
    findMany: jest.fn(),
  },
  reconciliationLog: {
    create: jest.fn(),
    findMany: jest.fn(),
  },
};

describe('ReconciliationService - Requirement 4', () => {
  let service: ReconciliationService;

  beforeEach(async () => {
    jest.clearAllMocks();
    
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReconciliationService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<ReconciliationService>(ReconciliationService);
  });

  it('should detect provider-only discrepancies (provider has payment, we dont)', async () => {
    const providerTransactions: ProviderTransaction[] = [
      {
        id: 'txn_001',
        orderId: 'order_001',
        amount: 5000,
        status: 'SUCCESS',
        createdAt: new Date(),
      },
    ];

    mockPrismaService.paymentRequest.findMany.mockResolvedValue([]);

    const result = await service.reconcile(providerTransactions);

    expect(result.discrepancies).toHaveLength(1);
    expect(result.discrepancies[0].type).toBe('PROVIDER_ONLY');
    expect(result.summary.providerOnly).toBe(1);
  });

  it('should detect status mismatch discrepancies', async () => {
    const providerTransactions: ProviderTransaction[] = [
      {
        id: 'txn_001',
        orderId: 'order_001',
        amount: 5000,
        status: 'SUCCESS',
        createdAt: new Date(),
      },
    ];

    mockPrismaService.paymentRequest.findMany.mockResolvedValue([
      {
        id: 'pay_001',
        orderId: 'order_001',
        amount: 5000,
        status: 'FAILED',
      },
    ]);

    const result = await service.reconcile(providerTransactions);

    expect(result.discrepancies).toHaveLength(1);
    expect(result.discrepancies[0].type).toBe('STATUS_MISMATCH');
    expect(result.summary.statusMismatch).toBe(1);
  });

  it('should detect internal-only discrepancies (we have payment, provider doesnt)', async () => {
    const providerTransactions: ProviderTransaction[] = [];

    mockPrismaService.paymentRequest.findMany.mockResolvedValue([
      {
        id: 'pay_001',
        orderId: 'order_001',
        amount: 5000,
        status: 'CONFIRMED',
      },
    ]);

    const result = await service.reconcile(providerTransactions);

    expect(result.discrepancies).toHaveLength(1);
    expect(result.discrepancies[0].type).toBe('INTERNAL_ONLY');
    expect(result.summary.internalOnly).toBe(1);
  });

  it('should return no discrepancies when data matches perfectly', async () => {
    const providerTransactions: ProviderTransaction[] = [
      {
        id: 'txn_001',
        orderId: 'order_001',
        amount: 5000,
        status: 'SUCCESS',
        createdAt: new Date(),
      },
    ];

    mockPrismaService.paymentRequest.findMany.mockResolvedValue([
      {
        id: 'pay_001',
        orderId: 'order_001',
        amount: 5000,
        status: 'CONFIRMED',
      },
    ]);

    const result = await service.reconcile(providerTransactions);

    expect(result.discrepancies).toHaveLength(0);
    expect(result.summary.providerOnly).toBe(0);
    expect(result.summary.internalOnly).toBe(0);
    expect(result.summary.statusMismatch).toBe(0);
  });

  it('should persist reconciliation log', async () => {
    const providerTransactions: ProviderTransaction[] = [];

    mockPrismaService.paymentRequest.findMany.mockResolvedValue([]);
    mockPrismaService.reconciliationLog.create.mockResolvedValue({});

    await service.reconcile(providerTransactions);

    expect(mockPrismaService.reconciliationLog.create).toHaveBeenCalled();
  });

  it('should return reconciliation history', async () => {
    const mockLogs = [
      { id: 'log_1', runAt: new Date(), discrepancies: [], status: 'COMPLETED' },
      { id: 'log_2', runAt: new Date(), discrepancies: [], status: 'COMPLETED' },
    ];

    mockPrismaService.reconciliationLog.findMany.mockResolvedValue(mockLogs);

    const result = await service.getReconciliationHistory(5);

    expect(result).toHaveLength(2);
    expect(mockPrismaService.reconciliationLog.findMany).toHaveBeenCalledWith({
      orderBy: { runAt: 'desc' },
      take: 5,
    });
  });
});