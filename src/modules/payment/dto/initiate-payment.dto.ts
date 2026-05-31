import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsInt, Min, Max, IsUUID, IsOptional } from 'class-validator';

export class InitiatePaymentDto {
  @ApiProperty({ example: 'order_12345', description: 'Unique order identifier' })
  @IsString()
  orderId!: string;

  @ApiProperty({ example: 'tenant_abc123', description: 'Tenant making the payment' })
  @IsString()
  tenantId!: string;

  @ApiProperty({ example: 5000, description: 'Amount in cents (e.g., 5000 = ₦50.00)' })
  @IsInt()
  @Min(1)
  @Max(10000000)
  amount!: number;

  @ApiProperty({ example: 'NGN', default: 'NGN', required: false })
  @IsOptional()
  @IsString()
  currency?: string;
}