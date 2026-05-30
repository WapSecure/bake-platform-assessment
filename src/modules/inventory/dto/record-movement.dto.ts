import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsInt, IsOptional, IsString, IsUUID, Min } from 'class-validator';

export enum MovementType {
  SALE = 'SALE',
  RESTOCK = 'RESTOCK',
  WASTE = 'WASTE',
  TRANSFER_IN = 'TRANSFER_IN',
  TRANSFER_OUT = 'TRANSFER_OUT',
}

export class RecordMovementDto {
  @ApiProperty({ example: 'location_abc123' })
  @IsUUID()
  locationId!: string;

  @ApiProperty({ example: 'item_abc123' })
  @IsUUID()
  itemId!: string;

  @ApiProperty({ enum: MovementType, example: 'SALE' })
  @IsEnum(MovementType)
  type!: MovementType;

  @ApiProperty({ example: 5 })
  @IsInt()
  @Min(1)
  quantity!: number;

  @ApiProperty({ example: 'ORDER-12345', required: false })
  @IsOptional()
  @IsString()
  referenceId?: string;

  @ApiProperty({ example: 'Customer walk-in sale', required: false })
  @IsOptional()
  @IsString()
  notes?: string;
}