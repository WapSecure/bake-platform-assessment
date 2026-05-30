import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async check() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { 
        status: 'healthy', 
        database: 'connected', 
        timestamp: new Date().toISOString() 
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return { 
        status: 'unhealthy', 
        database: 'disconnected', 
        error: errorMessage,
        timestamp: new Date().toISOString() 
      };
    }
  }
}