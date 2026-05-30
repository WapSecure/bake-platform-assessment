import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsInt, IsString, Min } from 'class-validator';

export enum OperationType {
  SALE = 'SALE',
  RESTOCK = 'RESTOCK',
  ADJUSTMENT = 'ADJUSTMENT',
  WASTE = 'WASTE',
}

export class SyncOperationDto {
  @ApiProperty({ example: 'op_1234567890' })
  @IsString()
  operationId!: string;

  @ApiProperty({ example: 'item_abc123' })
  @IsString()
  itemId!: string;

  @ApiProperty({ enum: OperationType, example: OperationType.SALE })
  @IsEnum(OperationType)
  type!: OperationType;

  @ApiProperty({ 
    example: 5, 
    description: 'Positive for RESTOCK, negative for ADJUSTMENT. SALE and WASTE quantities are converted to negative internally.' 
  })
  @IsInt()
  quantity!: number;

  @ApiProperty({ example: 1 })
  @IsInt()
  @Min(1)
  sequenceNumber!: number;

  @ApiProperty({ example: '2026-05-30T13:00:00.000Z' })
  @IsString()
  timestamp!: string;
}