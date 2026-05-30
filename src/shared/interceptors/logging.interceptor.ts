import { Injectable, NestInterceptor, ExecutionContext, CallHandler, Logger } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Request, Response } from 'express';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const ctx = context.switchToHttp();
    const req = ctx.getRequest<Request>();
    const res = ctx.getResponse<Response>();
    
    const requestId = req.headers['x-request-id'] as string || this.generateRequestId();
    const tenantId = req.headers['x-tenant-id'] as string || 'unknown';
    const startTime = Date.now();
    const method = req.method;
    const url = req.url;

    return next.handle().pipe(
      tap({
        next: () => {
          const latency = Date.now() - startTime;
          const statusCode = res.statusCode;
          
          this.logger.log({
            requestId,
            tenantId,
            method,
            url,
            statusCode,
            latencyMs: latency,
            outcome: statusCode >= 400 ? 'FAILURE' : 'SUCCESS',
          }, `${method} ${url} - ${statusCode} - ${latency}ms`);
        },
        error: (error) => {
          const latency = Date.now() - startTime;
          this.logger.error({
            requestId,
            tenantId,
            method,
            url,
            statusCode: error.status || 500,
            latencyMs: latency,
            error: error.message,
            outcome: 'FAILURE',
          }, `${method} ${url} - ERROR - ${latency}ms`);
        },
      }),
    );
  }

  private generateRequestId(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
  }
}