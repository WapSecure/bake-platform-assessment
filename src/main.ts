import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  
  // Enable logging
  app.useLogger(app.get(Logger));
  
  // Enable validation pipes
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  
  // Enable CORS
  app.enableCors();
  
  // Swagger documentation
  const config = new DocumentBuilder()
    .setTitle('Bake Platform Assessment')
    .setDescription(`
      ## API Documentation for Technical Assessment
      
      ### Task 1: Offline-first Sync Engine
      - POST /sync - Batch sync offline operations with conflict resolution
      
      ### Task 2: Multi-tenant Inventory API
      - POST /inventory/items - Create inventory item
      - GET /inventory/items - List items (tenant-scoped)
      - POST /inventory/movements - Record stock movement
      - GET /inventory/aggregate - Aggregate across locations
      
      ### Task 3: Payment Reliability Layer
      - POST /payments/initiate - Idempotent payment initiation
      - GET /payments/:id/status - Check payment status
      - POST /payments/reconcile - Run reconciliation
    `)
    .setVersion('1.0')
    .addTag('sync', 'Task 1 - Offline-first sync engine')
    .addTag('inventory', 'Task 2 - Multi-tenant inventory API')
    .addTag('payment', 'Task 3 - Payment reliability layer')
    .addBearerAuth()
    .build();
  
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document);
  
  const port = process.env.PORT || 3000;
  await app.listen(port);
  console.log(`🚀 Application running on: http://localhost:${port}`);
  console.log(`📚 Swagger documentation: http://localhost:${port}/api`);
}
bootstrap();