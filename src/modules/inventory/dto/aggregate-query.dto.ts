import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsOptional, IsString, IsUUID } from 'class-validator';

export class AggregateQueryDto {
  @ApiProperty({ example: 'parent_tenant_id', description: 'Parent account ID' })
  @IsUUID()
  parentTenantId!: string;

  @ApiProperty({ example: ['COKE-12OZ', 'BURGER'], required: false })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  skus?: string[];
}