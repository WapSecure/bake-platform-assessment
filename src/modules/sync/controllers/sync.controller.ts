import { Body, Controller, Post, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { SyncService } from '../services/sync.service';
import { SyncRequestDto } from '../dto/sync-request.dto';
import { SyncResponseDto } from '../dto/sync-response.dto';

@ApiTags('sync')
@Controller('sync')
export class SyncController {
  constructor(private readonly syncService: SyncService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: 'Sync offline operations',
    description: 'Accepts a batch of offline operations, detects conflicts, and returns structured diff'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Sync completed successfully',
    type: SyncResponseDto
  })
  @ApiResponse({ status: 400, description: 'Invalid request body' })
  async sync(@Body() syncRequest: SyncRequestDto): Promise<SyncResponseDto> {
    return this.syncService.sync(syncRequest);
  }
}