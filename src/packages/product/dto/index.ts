import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsEnum,
  IsArray,
  IsOptional,
  ValidateNested,
  ArrayMinSize,
  IsUUID,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { ProductStatus } from '@prisma/client';

export class CreateProductDto {
  @ApiProperty({ description: 'Product name' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({
    description: 'Image URL to download and upload to R2',
  })
  @IsString()
  @IsOptional()
  imageUrl?: string;

  @ApiPropertyOptional({
    enum: ProductStatus,
    default: ProductStatus.PRIVATE,
    description: 'Product visibility status',
  })
  @IsEnum(ProductStatus)
  @IsOptional()
  status?: ProductStatus;

  @ApiPropertyOptional({
    type: [String],
    description:
      'User IDs for whitelist access (only used if status=WHITELIST)',
  })
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      if (!value.trim()) return [];
      try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed : [value];
      } catch {
        return [value];
      }
    }
    return value;
  })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  whitelistUserIds?: string[];

  @ApiPropertyOptional({ type: 'string', format: 'binary' })
  @IsOptional()
  file?: any;
}

export class BulkCreateProductDto {
  @ApiProperty({
    type: [CreateProductDto],
    description: 'Array of products to create',
  })
  @IsArray()
  @ValidateNested({ each: true })
  @ArrayMinSize(1)
  @Type(() => CreateProductDto)
  products: CreateProductDto[];
}

export class UpdateProductDto {
  @ApiPropertyOptional({ description: 'Product name' })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiPropertyOptional({
    description: 'Image URL to download and upload to R2',
  })
  @IsString()
  @IsOptional()
  imageUrl?: string;

  @ApiPropertyOptional({ type: 'string', format: 'binary' })
  @IsOptional()
  file?: any;

  @ApiPropertyOptional({
    enum: ProductStatus,
    description: 'Product visibility status',
  })
  @IsEnum(ProductStatus)
  @IsOptional()
  status?: ProductStatus;

  @ApiPropertyOptional({
    type: [String],
    description: 'User IDs for whitelist access',
  })
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      if (!value.trim()) return [];
      try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed : [value];
      } catch {
        return [value];
      }
    }
    return value;
  })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  whitelistUserIds?: string[];
}

export class ProductResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty({
    description:
      'Image URL - points to /products/:id/image endpoint with username watermark',
  })
  imageUrl: string;

  @ApiProperty({ enum: ProductStatus })
  status: ProductStatus;

  @ApiProperty({ type: [String] })
  whitelistUserIds: string[];

  @ApiProperty()
  isDeleted: boolean;

  @ApiProperty({ required: false, nullable: true })
  deletedAt: Date | null;

  @ApiProperty()
  updatedBy: string;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}

export class PaginationMetaDto {
  @ApiProperty()
  total: number;

  @ApiProperty()
  page: number;

  @ApiProperty()
  limit: number;

  @ApiProperty()
  totalPages: number;
}

export class PaginatedProductsDto {
  @ApiProperty({ type: [ProductResponseDto] })
  items: ProductResponseDto[];

  @ApiProperty({ type: PaginationMetaDto })
  meta: PaginationMetaDto;
}

export class RestoreProductDto {
  @ApiProperty({
    type: [String],
    description: 'Array of product IDs to restore',
  })
  @IsArray()
  @IsString({ each: true })
  @ArrayMinSize(1)
  productIds: string[];
}

export class BulkDeleteDto {
  @ApiProperty({
    type: [String],
    description: 'Array of product IDs to delete',
  })
  @IsArray()
  @IsString({ each: true })
  @ArrayMinSize(1)
  productIds: string[];
}

export class ImportJobStatusDto {
  @ApiProperty({ description: 'Job ID' })
  jobId: string;

  @ApiProperty({ description: 'Job status' })
  status: 'pending' | 'processing' | 'completed' | 'failed';

  @ApiProperty({ description: 'Total products to process' })
  total: number;

  @ApiProperty({ description: 'Products processed so far' })
  processed: number;

  @ApiProperty({ description: 'Products created successfully' })
  successful: number;

  @ApiProperty({ description: 'Products failed to create' })
  failed: number;

  @ApiPropertyOptional({ description: 'Error message if job failed' })
  error?: string;

  @ApiPropertyOptional({
    description: 'Created products',
    type: [ProductResponseDto],
  })
  products?: ProductResponseDto[];
}
