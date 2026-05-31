import { ApiProperty } from '@nestjs/swagger';

export class ProviderTransactionDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  orderId!: string;

  @ApiProperty()
  amount!: number;

  @ApiProperty({ enum: ['SUCCESS', 'FAILED', 'PENDING'] })
  status!: 'SUCCESS' | 'FAILED' | 'PENDING';

  @ApiProperty()
  createdAt!: string;
}