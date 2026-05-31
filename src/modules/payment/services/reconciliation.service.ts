import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';

export interface ProviderTransaction {
  id: string;
  orderId: string;
  amount: number;
  status: 'SUCCESS' | 'FAILED' | 'PENDING';
  createdAt: Date;
}

@Injectable()
export class ReconciliationService {
  private readonly logger = new Logger(ReconciliationService.name);

  constructor(private readonly prisma: PrismaService) {}

  async reconcile(providerTransactions: ProviderTransaction[]) {
    const startTime = Date.now();
    this.logger.log('Starting reconciliation...');

    const discrepancies: any[] = [];

    const internalPayments = await this.prisma.paymentRequest.findMany({
      where: {
        createdAt: {
          gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
        },
      },
    });

    for (const providerTxn of providerTransactions) {
      const internal = internalPayments.find(p => p.orderId === providerTxn.orderId);
      
      if (!internal && providerTxn.status === 'SUCCESS') {
        discrepancies.push({
          type: 'PROVIDER_ONLY',
          orderId: providerTxn.orderId,
          amount: providerTxn.amount,
          providerStatus: providerTxn.status,
          message: 'Payment exists in provider but not in our system',
        });
      } else if (internal && providerTxn.status === 'SUCCESS' && internal.status !== 'CONFIRMED') {
        discrepancies.push({
          type: 'STATUS_MISMATCH',
          orderId: providerTxn.orderId,
          internalStatus: internal.status,
          providerStatus: providerTxn.status,
          internalAmount: internal.amount,
          providerAmount: providerTxn.amount,
          message: `Internal status ${internal.status} but provider shows SUCCESS`,
        });
      }
    }

    for (const internal of internalPayments) {
      const providerTxn = providerTransactions.find(p => p.orderId === internal.orderId);
      
      if (!providerTxn && internal.status === 'CONFIRMED') {
        discrepancies.push({
          type: 'INTERNAL_ONLY',
          orderId: internal.orderId,
          amount: internal.amount,
          internalStatus: internal.status,
          message: 'Payment exists in our system but not in provider',
        });
      }
    }

    await this.prisma.reconciliationLog.create({
      data: {
        discrepancies,
        resolvedCount: 0,
        status: 'COMPLETED',
      },
    });

    this.logger.log({
      message: 'Reconciliation completed',
      totalProviderTransactions: providerTransactions.length,
      totalInternalPayments: internalPayments.length,
      discrepanciesFound: discrepancies.length,
      durationMs: Date.now() - startTime,
    });

    return {
      runAt: new Date().toISOString(),
      totalProviderTransactions: providerTransactions.length,
      totalInternalPayments: internalPayments.length,
      discrepancies,
      summary: {
        providerOnly: discrepancies.filter(d => d.type === 'PROVIDER_ONLY').length,
        internalOnly: discrepancies.filter(d => d.type === 'INTERNAL_ONLY').length,
        statusMismatch: discrepancies.filter(d => d.type === 'STATUS_MISMATCH').length,
      },
    };
  }

  async getReconciliationHistory(limit: number = 10) {
    return this.prisma.reconciliationLog.findMany({
      orderBy: { runAt: 'desc' },
      take: limit,
    });
  }

  async getDiscrepanciesByType(type: string) {
    const logs = await this.prisma.reconciliationLog.findMany({
      orderBy: { runAt: 'desc' },
      take: 5,
    });

    const allDiscrepancies = logs.flatMap(log => log.discrepancies as any[]);
    return allDiscrepancies.filter(d => d.type === type);
  }
}