import { Controller, Get, Post, Put, Delete, Body, Param, Query, Req, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery, ApiParam, ApiHeader } from '@nestjs/swagger';
import { Request } from 'express';
import { InventoryService } from '../services/inventory.service';
import { AggregateService } from '../services/aggregate.service';
import { CreateItemDto } from '../dto/create-item.dto';
import { UpdateItemDto } from '../dto/update-item.dto';
import { RecordMovementDto } from '../dto/record-movement.dto';
import { AggregateQueryDto } from '../dto/aggregate-query.dto';

@ApiTags('inventory')
@Controller('inventory')
export class InventoryController {
  constructor(
    private readonly inventoryService: InventoryService,
    private readonly aggregateService: AggregateService,
  ) {}

  private getTenantId(req: Request): string {
    return (req.headers['x-tenant-id'] as string) || 'default_tenant';
  }

  private getParentTenantId(req: Request): string {
    return (req.headers['x-parent-tenant-id'] as string) || '';
  }

  @Post('items')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new inventory item' })
  @ApiResponse({ status: 201, description: 'Item created successfully' })
  @ApiResponse({ status: 403, description: 'Location access denied' })
  @ApiHeader({ name: 'x-tenant-id', description: 'Tenant ID', required: true })
  async createItem(@Req() req: Request, @Body() dto: CreateItemDto) {
    const tenantId = this.getTenantId(req);
    return this.inventoryService.createItem(tenantId, dto);
  }

  @Get('items')
  @ApiOperation({ summary: 'List inventory items', description: 'Returns all items for the tenant. Optionally filter by location ID.' })
  @ApiQuery({ name: 'locationId', required: false, description: 'Filter by location ID (optional - returns all items for tenant if omitted)' })
  @ApiHeader({ name: 'x-tenant-id', description: 'Tenant ID', required: true })
  async getItems(
    @Req() req: Request,
    @Query('locationId') locationId?: string,
  ) {
    const tenantId = this.getTenantId(req);
    return this.inventoryService.getItems(tenantId, locationId);
  }

  @Get('items/:id')
  @ApiOperation({ summary: 'Get single inventory item' })
  @ApiParam({ name: 'id', description: 'Item ID' })
  @ApiHeader({ name: 'x-tenant-id', description: 'Tenant ID', required: true })
  async getItem(@Req() req: Request, @Param('id') id: string) {
    const tenantId = this.getTenantId(req);
    return this.inventoryService.getItem(tenantId, id);
  }

  @Put('items/:id')
  @ApiOperation({ summary: 'Update inventory item' })
  @ApiParam({ name: 'id', description: 'Item ID' })
  @ApiHeader({ name: 'x-tenant-id', description: 'Tenant ID', required: true })
  async updateItem(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() dto: UpdateItemDto,
  ) {
    const tenantId = this.getTenantId(req);
    return this.inventoryService.updateItem(tenantId, id, dto);
  }

  @Delete('items/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete inventory item' })
  @ApiParam({ name: 'id', description: 'Item ID' })
  @ApiHeader({ name: 'x-tenant-id', description: 'Tenant ID', required: true })
  async deleteItem(@Req() req: Request, @Param('id') id: string) {
    const tenantId = this.getTenantId(req);
    return this.inventoryService.deleteItem(tenantId, id);
  }

  @Post('movements')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Record stock movement (sale, restock, waste, transfer)' })
  @ApiResponse({ status: 201, description: 'Movement recorded successfully' })
  @ApiResponse({ status: 404, description: 'Item not found' })
  @ApiHeader({ name: 'x-tenant-id', description: 'Tenant ID', required: true })
  async recordMovement(@Req() req: Request, @Body() dto: RecordMovementDto) {
    const tenantId = this.getTenantId(req);
    return this.inventoryService.recordMovement(tenantId, dto);
  }

  @Get('stock/:itemId')
  @ApiOperation({ summary: 'Get current stock for an item' })
  @ApiParam({ name: 'itemId', description: 'Item ID' })
  @ApiHeader({ name: 'x-tenant-id', description: 'Tenant ID', required: true })
  async getStock(@Req() req: Request, @Param('itemId') itemId: string) {
    const tenantId = this.getTenantId(req);
    await this.inventoryService.getItem(tenantId, itemId);
    const stock = await this.inventoryService.getCurrentStock(itemId);
    return { itemId, currentStock: stock };
  }

  @Get('aggregate')
  @ApiOperation({ summary: 'Get aggregate stock across all locations', description: 'For parent accounts to view total stock across all locations' })
  @ApiHeader({ name: 'x-parent-tenant-id', description: 'Parent Tenant ID', required: true })
  async getAggregate(@Req() req: Request, @Query() query: AggregateQueryDto) {
    const parentTenantId = this.getParentTenantId(req) || query.parentTenantId;
    return this.aggregateService.getAggregateStock(parentTenantId, query.skus);
  }

  @Get('locations/:locationId/stock')
  @ApiOperation({ summary: 'Get stock for a specific location', description: 'Returns all items and their current stock for a given location' })
  @ApiParam({ name: 'locationId', description: 'Location ID' })
  @ApiHeader({ name: 'x-tenant-id', description: 'Tenant ID', required: true })
  async getLocationStock(
    @Req() req: Request,
    @Param('locationId') locationId: string,
  ) {
    const tenantId = this.getTenantId(req);
    return this.inventoryService.getStockByLocation(tenantId, locationId);
  }
}