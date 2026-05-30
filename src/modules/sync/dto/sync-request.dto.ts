import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsString, ValidateNested, ArrayMinSize } from 'class-validator';
import { Type } from 'class-transformer';
import { SyncOperationDto } from './sync-operation.dto';

export class SyncRequestDto {
  @ApiProperty({ example: 'tenant_123' })
  @IsString()
  tenantId!: string;

  @ApiProperty({ example: 'device_456' })
  @IsString()
  deviceId!: string;

  @ApiProperty({ type: [SyncOperationDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => SyncOperationDto)
  operations!: SyncOperationDto[];
}