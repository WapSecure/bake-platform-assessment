import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsInt, Min, Max, IsUUID } from 'class-validator';

export class CreateItemDto {
  @ApiProperty({ example: 'location_abc123' })
  @IsUUID()
  locationId!: string;

  @ApiProperty({ example: 'COKE-12OZ' })
  @IsString()
  sku!: string;

  @ApiProperty({ example: 'Coca Cola 12oz' })
  @IsString()
  name!: string;

  @ApiProperty({ example: 'Carbonated soft drink', required: false })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ example: 150, description: 'Price in cents ($1.50)', required: false })
  @IsOptional()
  @IsInt()
  @Min(0)
  unitPrice?: number;

  @ApiProperty({ example: 5, description: 'Minimum stock threshold for alerts', required: false })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1000)
  minThreshold?: number;
}