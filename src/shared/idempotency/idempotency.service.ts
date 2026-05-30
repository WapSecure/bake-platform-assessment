import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

@Injectable()
export class IdempotencyService {
  constructor(private readonly prisma: PrismaService) {}

  async hasBeenProcessed(operationId: string): Promise<boolean> {
    const existing = await this.prisma.processedOperation.findUnique({
      where: { operationId },
    });
    return !!existing;
  }

  async markAsProcessed(operationId: string, deviceId: string, tenantId: string): Promise<void> {
    await this.prisma.processedOperation.upsert({
      where: { operationId },
      update: {},
      create: {
        operationId,
        deviceId,
        tenantId,
      },
    });
  }
}