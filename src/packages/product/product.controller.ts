import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  ParseIntPipe,
  DefaultValuePipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiConsumes,
  ApiBody,
  ApiQuery,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { ProductService } from './product.service';
import {
  CreateProductDto,
  UpdateProductDto,
  ProductResponseDto,
  PaginatedProductsDto,
  BulkCreateProductDto,
  RestoreProductDto,
  BulkDeleteDto,
  ImportJobStatusDto,
} from './dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { User } from '../../common/decorators/user.decorator';
import type { JwtUser } from '../../common/interfaces/jwt-user.interface';
import * as XLSX from 'xlsx';

@ApiTags('products')
@Controller('products')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth('JWT-auth')
export class ProductController {
  constructor(private readonly productService: ProductService) {}

  @Post()
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Create product (ADMIN only)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        imageUrl: { type: 'string', description: 'Optional if file provided' },
        file: {
          type: 'string',
          format: 'binary',
          description: 'Optional if imageUrl provided',
        },
        status: {
          type: 'string',
          enum: ['PUBLISHED', 'PRIVATE', 'WHITELIST'],
        },
        whitelistUserIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'User IDs for whitelist (JSON array as string)',
        },
      },
    },
  })
  @ApiResponse({
    status: 201,
    description: 'Product created',
    type: ProductResponseDto,
  })
  @UseInterceptors(FileInterceptor('file'))
  async create(
    @Body() dto: CreateProductDto,
    @User() user: JwtUser,
    @UploadedFile() file?: Express.Multer.File,
  ): Promise<ProductResponseDto> {
    return this.productService.create(dto, user.id, file);
  }

  @Post('bulk')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Bulk create products (ADMIN only)' })
  @ApiBody({ type: BulkCreateProductDto })
  @ApiResponse({
    status: 201,
    description: 'Products created',
    type: [ProductResponseDto],
  })
  async bulkCreate(
    @Body() dto: BulkCreateProductDto,
    @User() user: JwtUser,
  ): Promise<ProductResponseDto[]> {
    return this.productService.bulkCreate(dto.products, user.id);
  }

  @Patch(':id')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Update product (ADMIN only)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        imageUrl: { type: 'string' },
        file: { type: 'string', format: 'binary' },
        status: {
          type: 'string',
          enum: ['PUBLISHED', 'PRIVATE', 'WHITELIST'],
        },
        whitelistUserIds: {
          type: 'array',
          items: { type: 'string' },
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Product updated',
    type: ProductResponseDto,
  })
  @UseInterceptors(FileInterceptor('file'))
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateProductDto,
    @User() user: JwtUser,
    @UploadedFile() file?: Express.Multer.File,
  ): Promise<ProductResponseDto> {
    return this.productService.update(id, dto, user.id, file);
  }

  @Get()
  @ApiOperation({ summary: 'List products with pagination' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({
    status: 200,
    description: 'Products list',
    type: PaginatedProductsDto,
  })
  async findAll(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
    @Query('search') search?: string,
    @Query('status') status?: string,
  ): Promise<PaginatedProductsDto> {
    return this.productService.findAll(page, limit, search, status as any);
  }

  @Get('trash')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'List deleted products (ADMIN only)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({
    status: 200,
    description: 'Deleted products list',
    type: PaginatedProductsDto,
  })
  async findDeleted(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
    @Query('search') search?: string,
    @Query('status') status?: string,
  ): Promise<PaginatedProductsDto> {
    return this.productService.findDeleted(page, limit, search, status as any);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get product detail with access control' })
  @ApiResponse({
    status: 200,
    description: 'Product details',
    type: ProductResponseDto,
  })
  async findOne(
    @Param('id') id: string,
    @User() user: JwtUser,
  ): Promise<ProductResponseDto> {
    return this.productService.findOne(id, user.id);
  }

  @Delete(':id/soft')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Soft delete product (ADMIN only)' })
  @ApiResponse({ status: 200, description: 'Product soft deleted' })
  async softDelete(
    @Param('id') id: string,
    @User() user: JwtUser,
  ): Promise<{ message: string }> {
    await this.productService.softDelete(id, user.id);
    return { message: 'Product soft deleted successfully' };
  }

  @Delete(':id/hard')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Hard delete product (ADMIN only)' })
  @ApiResponse({ status: 200, description: 'Product hard deleted' })
  async hardDelete(@Param('id') id: string): Promise<{ message: string }> {
    await this.productService.hardDelete(id);
    return { message: 'Product hard deleted successfully' };
  }

  @Post('bulk-soft-delete')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Bulk soft delete products (ADMIN only)' })
  @ApiBody({ type: BulkDeleteDto })
  @ApiResponse({ status: 200, description: 'Products soft deleted' })
  async bulkSoftDelete(
    @Body() dto: BulkDeleteDto,
    @User() user: JwtUser,
  ): Promise<{ message: string }> {
    await this.productService.bulkSoftDelete(dto.productIds, user.id);
    return { message: 'Products soft deleted successfully' };
  }

  @Post('bulk-hard-delete')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Bulk hard delete products (ADMIN only)' })
  @ApiBody({ type: BulkDeleteDto })
  @ApiResponse({ status: 200, description: 'Products hard deleted' })
  async bulkHardDelete(
    @Body() dto: BulkDeleteDto,
  ): Promise<{ message: string }> {
    await this.productService.bulkHardDelete(dto.productIds);
    return { message: 'Products hard deleted successfully' };
  }

  @Post('restore')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Restore products from trash (ADMIN only)' })
  @ApiBody({ type: RestoreProductDto })
  @ApiResponse({ status: 200, description: 'Products restored' })
  async restore(@Body() dto: RestoreProductDto): Promise<{ message: string }> {
    await this.productService.restore(dto.productIds);
    return { message: 'Products restored successfully' };
  }

  @Post('import-excel')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Import products from Excel file (ADMIN only)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'Excel file (.xlsx, .xls)',
        },
      },
    },
  })
  @ApiResponse({
    status: 202,
    description: 'Import job started',
    type: ImportJobStatusDto,
  })
  @UseInterceptors(FileInterceptor('file'))
  async importExcel(
    @UploadedFile() file: Express.Multer.File,
    @User() user: JwtUser,
  ): Promise<ImportJobStatusDto> {
    return this.productService.importExcel(file, user.id);
  }

  @Get('import-status/:jobId')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Get import job status (ADMIN only)' })
  @ApiResponse({
    status: 200,
    description: 'Import job status',
    type: ImportJobStatusDto,
  })
  async getImportStatus(
    @Param('jobId') jobId: string,
  ): Promise<ImportJobStatusDto> {
    return this.productService.getImportStatus(jobId);
  }

  // ========== Product Reactions (Heart/Like) ==========

  @Get(':id/reaction')
  @ApiOperation({ summary: 'Get reaction state for product' })
  @ApiResponse({
    status: 200,
    description: 'Reaction state',
  })
  async getReactionState(
    @Param('id') id: string,
    @User() user: JwtUser,
  ): Promise<{ reacted: boolean; count: number }> {
    return this.productService.getReactionState(id, user.id);
  }

  @Post(':id/reaction')
  @ApiOperation({ summary: 'Toggle heart/like reaction on product' })
  @ApiResponse({
    status: 200,
    description: 'Reaction toggled',
  })
  async toggleReaction(
    @Param('id') id: string,
    @User() user: JwtUser,
  ): Promise<{ reacted: boolean; count: number }> {
    return this.productService.toggleReaction(id, user.id);
  }

  // ========== Saved Products (Bookmark) ==========

  @Get(':id/save')
  @ApiOperation({ summary: 'Get save state for product' })
  @ApiResponse({
    status: 200,
    description: 'Save state',
  })
  async getSaveState(
    @Param('id') id: string,
    @User() user: JwtUser,
  ): Promise<{ saved: boolean }> {
    return this.productService.getSaveState(id, user.id);
  }

  @Post(':id/save')
  @ApiOperation({ summary: 'Toggle save/bookmark product' })
  @ApiResponse({
    status: 200,
    description: 'Save toggled',
  })
  async toggleSaved(
    @Param('id') id: string,
    @User() user: JwtUser,
  ): Promise<{ saved: boolean }> {
    return this.productService.toggleSaved(id, user.id);
  }

  // ========== Refresh Image URL ==========

  @Get(':id/refresh-image')
  @ApiOperation({ summary: 'Refresh signed image URL for product' })
  @ApiResponse({
    status: 200,
    description: 'New signed URL',
  })
  async refreshImageUrl(
    @Param('id') id: string,
    @User() user: JwtUser,
  ): Promise<{ url: string }> {
    return this.productService.refreshImageUrl(id, user.id);
  }

  @Get('user/saved')
  @ApiOperation({ summary: 'Get user saved products' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({
    status: 200,
    description: 'Saved products list',
    type: PaginatedProductsDto,
  })
  async getSavedProducts(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
    @User() user: JwtUser,
  ): Promise<PaginatedProductsDto> {
    return this.productService.getSavedProducts(user.id, page, limit);
  }

  @Get('user/reacted')
  @ApiOperation({ summary: 'Get user reacted/liked products' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({
    status: 200,
    description: 'Reacted products list',
    type: PaginatedProductsDto,
  })
  async getReactedProducts(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
    @User() user: JwtUser,
  ): Promise<PaginatedProductsDto> {
    return this.productService.getReactedProducts(user.id, page, limit);
  }
}
