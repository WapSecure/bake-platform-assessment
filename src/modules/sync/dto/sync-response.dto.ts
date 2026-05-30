import { ApiProperty } from '@nestjs/swagger';

export class AcceptedOperationDto {
  @ApiProperty()
  operationId!: string;
  
  @ApiProperty()
  status!: string;
}

export class RejectedOperationDto {
  @ApiProperty()
  operationId!: string;
  
  @ApiProperty()
  status!: string;
  
  @ApiProperty()
  reason!: string;
}

export class DuplicateOperationDto {
  @ApiProperty()
  operationId!: string;
  
  @ApiProperty()
  status!: string;
}

export class SyncResponseDto {
  @ApiProperty({ type: [AcceptedOperationDto] })
  accepted!: AcceptedOperationDto[];

  @ApiProperty({ type: [RejectedOperationDto] })
  rejected!: RejectedOperationDto[];

  @ApiProperty({ type: [DuplicateOperationDto] })
  duplicates!: DuplicateOperationDto[];
}