import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { R2Service } from '../r2/r2.service';
import { CacheService } from '../cache/cache.service';
import { EventsGateway } from '../events/events.gateway';
import { NotificationService } from '../notification/notification.service';
import { ProductStatus, Product, NotificationType } from '@prisma/client';
import {
  CreateProductDto,
  UpdateProductDto,
  ProductResponseDto,
  PaginatedProductsDto,
  ImportJobStatusDto,
} from './dto';
import { v4 as uuidv4 } from 'uuid';
import * as XLSX from 'xlsx';

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const CACHE_KEY_PREFIX = 'products';
type Status = 'PRIVATE' | 'WHITELIST';

// In-memory storage for import jobs (in production, use Redis)
interface ImportJob {
  jobId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  total: number;
  processed: number;
  successful: number;
  failed: number;
  error?: string;
  createdProducts?: Product[];
}

const importJobs = new Map<string, ImportJob>();

@Injectable()
export class ProductService {
  private readonly logger = new Logger(ProductService.name);

  constructor(
    private prisma: PrismaService,
    private r2Service: R2Service,
    private cache: CacheService,
    @Inject(forwardRef(() => EventsGateway))
    private eventsGateway: EventsGateway,
    @Inject(forwardRef(() => NotificationService))
    private notificationService: NotificationService,
  ) {}

  async create(
    dto: CreateProductDto,
    userId: string,
    file?: Express.Multer.File,
  ): Promise<ProductResponseDto> {
    let imageKey: string;
    const folder = 'products';

    if (file) {
      const fileExtension = file.originalname.split('.').pop();
      imageKey = `${folder}/${uuidv4()}.${fileExtension}`;

      // Await upload to ensure availability
      try {
        await this.r2Service.uploadFile(file, folder, imageKey);
      } catch (err) {
        this.logger.error(
          `Upload failed for key ${imageKey}: ${err.message}`,
          err.stack,
        );
        throw new BadRequestException('Failed to upload image');
      }
    } else if (dto.imageUrl) {
      // Try to guess extension or default to jpg
      const extension =
        dto.imageUrl.split('.').pop()?.split('?')[0]?.substring(0, 4) || 'jpg';
      const safeExtension = ['jpg', 'png', 'gif', 'webp'].includes(extension)
        ? extension
        : 'jpg';
      imageKey = `${folder}/${uuidv4()}.${safeExtension}`;

      // Await upload to ensure availability
      try {
        await this.r2Service.uploadFromUrl(dto.imageUrl, folder, imageKey);
      } catch (err) {
        this.logger.error(
          `Upload from URL failed for key ${imageKey}: ${err.message}`,
          err.stack,
        );
        throw new BadRequestException('Failed to upload image from URL');
      }
    } else {
      throw new BadRequestException('Either file or imageUrl must be provided');
    }

    const product = await this.prisma.product.create({
      data: {
        name: dto.name,
        imageKey,
        status: dto.status || ProductStatus.PRIVATE,
        whitelistUserIds: dto.whitelistUserIds || [],
        updatedBy: userId,
      },
    });

    await this.invalidateCache();
    return this.toResponseDto(product, userId);
  }

  async bulkCreate(
    dtos: CreateProductDto[],
    userId: string,
  ): Promise<ProductResponseDto[]> {
    // Validate tất cả dtos trước
    for (const dto of dtos) {
      if (!dto.imageUrl) {
        throw new BadRequestException(
          'Bulk create only supports imageUrl, not file upload',
        );
      }
    }

    const folder = 'products';
    const BATCH_SIZE = 10; // Xử lý 10 images mỗi lần để tránh socket limit
    const successfulUploads: Array<{
      dto: CreateProductDto;
      imageKey: string;
    }> = [];
    const failedUploads: Array<{ dto: CreateProductDto; error: string }> = [];

    // Chia thành các batches nhỏ
    for (let i = 0; i < dtos.length; i += BATCH_SIZE) {
      const batch = dtos.slice(i, i + BATCH_SIZE);

      const uploadPromises = batch.map(async (dto) => {
        const extension =
          dto.imageUrl?.split('.').pop()?.split('?')[0]?.substring(0, 4) ||
          'jpg';
        const safeExtension = ['jpg', 'png', 'gif', 'webp'].includes(extension)
          ? extension
          : 'jpg';
        const imageKey = `${folder}/${uuidv4()}.${safeExtension}`;

        try {
          await this.r2Service.uploadFromUrl(
            dto.imageUrl || '',
            folder,
            imageKey,
          );
          return { success: true, dto, imageKey };
        } catch (err) {
          this.logger.error(
            `Upload failed for "${dto.name}": ${err.message}`,
            err.stack,
          );
          return {
            success: false,
            dto,
            error: err.message || 'Upload failed',
          };
        }
      });

      const batchResults = await Promise.allSettled(uploadPromises);

      batchResults.forEach((result) => {
        if (result.status === 'fulfilled') {
          if (result.value.success && result.value.imageKey) {
            successfulUploads.push({
              dto: result.value.dto,
              imageKey: result.value.imageKey,
            });
          } else {
            failedUploads.push({
              dto: result.value.dto,
              error: result.value.error,
            });
          }
        } else {
          failedUploads.push({
            dto: batch[0],
            error: result.reason?.message || 'Unknown error',
          });
        }
      });

      if (i + BATCH_SIZE < dtos.length) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }

    if (failedUploads.length > 0) {
      this.logger.warn(
        `Failed to upload ${failedUploads.length}/${dtos.length} images:`,
        failedUploads.map((f) => `${f.dto.name}: ${f.error}`).join(', '),
      );
    }

    if (successfulUploads.length === 0) {
      throw new BadRequestException(
        'All image uploads failed. Please check image URLs and try again.',
      );
    }

    const productData = successfulUploads.map(({ dto, imageKey }) => ({
      name: dto.name,
      imageKey,
      status: dto.status || ProductStatus.PRIVATE,
      whitelistUserIds: dto.whitelistUserIds || [],
      updatedBy: userId,
    }));

    await this.prisma.product.createMany({
      data: productData,
    });

    const createdProducts = await this.prisma.product.findMany({
      where: {
        imageKey: { in: successfulUploads.map((r) => r.imageKey) },
      },
      orderBy: { createdAt: 'desc' },
    });

    const responseDtos = await Promise.all(
      createdProducts.map((p) => this.toResponseDto(p, userId)),
    );

    await this.invalidateCache();

    this.logger.log(
      `Bulk create completed: ${successfulUploads.length} succeeded, ${failedUploads.length} failed`,
    );

    return responseDtos;
  }

  async update(
    id: string,
    dto: UpdateProductDto,
    userId: string,
    file?: Express.Multer.File,
  ): Promise<ProductResponseDto> {
    const product = await this.prisma.product.findUnique({
      where: { id },
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    if (product.isDeleted) {
      throw new BadRequestException('Cannot update deleted product');
    }

    let imageKey = product.imageKey;

    if (file || dto.imageUrl) {
      await this.r2Service.deleteFile(product.imageKey);

      if (file) {
        const uploadResult = await this.r2Service.uploadFile(file, 'products');
        imageKey = uploadResult.key;
      } else if (dto.imageUrl) {
        const uploadResult = await this.r2Service.uploadFromUrl(
          dto.imageUrl,
          'products',
        );
        imageKey = uploadResult.key;
      }
    }

    const updated = await this.prisma.product.update({
      where: { id },
      data: {
        ...(dto.name && { name: dto.name }),
        ...(imageKey !== product.imageKey && { imageKey }),
        ...(dto.status && { status: dto.status }),
        ...(dto.whitelistUserIds !== undefined && {
          whitelistUserIds: dto.whitelistUserIds,
        }),
        updatedBy: userId,
      },
    });

    await this.invalidateCache();
    return this.toResponseDto(updated, userId);
  }

  async findAll(
    page: number = 1,
    limit: number = 10,
    search?: string,
    status?: ProductStatus,
  ): Promise<PaginatedProductsDto> {
    const cacheKey = `${CACHE_KEY_PREFIX}:list:page:${page}:limit:${limit}:search:${search || ''}:status:${status || ''}`;
    const cached = await this.cache.get<PaginatedProductsDto>(cacheKey);

    if (cached) {
      return cached;
    }

    const where: any = { isDeleted: false };

    if (search) {
      where.name = { contains: search };
    }

    if (status) {
      where.status = status;
    }

    if (page === 0) {
      const products = await this.prisma.product.findMany({
        where,
        orderBy: { createdAt: 'desc' },
      });

      const result: PaginatedProductsDto = {
        items: await Promise.all(
          products.map((p) => this.toResponseDto(p, null)),
        ),
        meta: {
          total: products.length,
          page: 0,
          limit: products.length,
          totalPages: 1,
        },
      };

      await this.cache.set(cacheKey, result, CACHE_TTL);
      return result;
    }

    const total = await this.prisma.product.count({ where });
    const products = await this.prisma.product.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: 'desc' },
    });

    const result: PaginatedProductsDto = {
      items: await Promise.all(
        products.map((p) => this.toResponseDto(p, null)),
      ),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };

    await this.cache.set(cacheKey, result, CACHE_TTL);
    return result;
  }

  async findOne(id: string, userId: string): Promise<ProductResponseDto> {
    const cacheKey = `${CACHE_KEY_PREFIX}:detail:${id}`;
    const cached = await this.cache.get<ProductResponseDto>(cacheKey);

    if (cached) {
      return cached;
    }

    const product = await this.prisma.product.findUnique({
      where: { id },
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    if (product.isDeleted) {
      throw new NotFoundException('Product not found');
    }

    if (product.status === ProductStatus.WHITELIST) {
      const user = await this.prisma.user.findUnique({ where: { id: userId } });
      const isAdmin = user?.role === 'ADMIN';

      if (!isAdmin && !product.whitelistUserIds.includes(userId)) {
        throw new ForbiddenException(
          'You are not authorized to view this product',
        );
      }
    }

    const result = await this.toResponseDto(product, userId);
    await this.cache.set(cacheKey, result, CACHE_TTL);
    return result;
  }

  async softDelete(id: string, userId: string): Promise<void> {
    const product = await this.prisma.product.findUnique({
      where: { id },
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    await this.prisma.product.update({
      where: { id },
      data: {
        isDeleted: true,
        deletedAt: new Date(),
        updatedBy: userId,
      },
    });

    await this.invalidateCache();
  }

  async hardDelete(id: string): Promise<void> {
    const product = await this.prisma.product.findUnique({
      where: { id },
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    await this.r2Service.deleteFile(product.imageKey);
    await this.prisma.product.delete({
      where: { id },
    });

    await this.invalidateCache();
  }

  async bulkSoftDelete(ids: string[], userId: string): Promise<void> {
    await this.prisma.product.updateMany({
      where: { id: { in: ids } },
      data: {
        isDeleted: true,
        deletedAt: new Date(),
        updatedBy: userId,
      },
    });

    await this.invalidateCache();
  }

  async bulkHardDelete(ids: string[]): Promise<void> {
    const products = await this.prisma.product.findMany({
      where: { id: { in: ids } },
    });

    for (const product of products) {
      await this.r2Service.deleteFile(product.imageKey);
    }

    await this.prisma.product.deleteMany({
      where: { id: { in: ids } },
    });

    await this.invalidateCache();
  }

  async findDeleted(
    page: number = 1,
    limit: number = 10,
    search?: string,
    status?: ProductStatus,
  ): Promise<PaginatedProductsDto> {
    const where: any = { isDeleted: true };

    if (search) {
      where.name = { contains: search };
    }

    if (status) {
      where.status = status;
    }

    if (page === 0) {
      const products = await this.prisma.product.findMany({
        where,
        orderBy: { deletedAt: 'desc' },
      });

      return {
        items: products.map((p) => this.toResponseDtoWithoutUrl(p)),
        meta: {
          total: products.length,
          page: 0,
          limit: products.length,
          totalPages: 1,
        },
      };
    }

    const total = await this.prisma.product.count({ where });
    const products = await this.prisma.product.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { deletedAt: 'desc' },
    });

    return {
      items: products.map((p) => this.toResponseDtoWithoutUrl(p)),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async restore(ids: string[]): Promise<void> {
    await this.prisma.product.updateMany({
      where: { id: { in: ids }, isDeleted: true },
      data: {
        isDeleted: false,
        deletedAt: null,
      },
    });

    await this.invalidateCache();
  }

  private async toResponseDto(
    product: Product,
    userId: string | null,
  ): Promise<ProductResponseDto> {
    const imageUrl = await this.getImageUrl(product, userId);

    return {
      id: product.id,
      name: product.name,
      imageUrl,
      status: product.status,
      whitelistUserIds: product.whitelistUserIds,
      isDeleted: product.isDeleted,
      deletedAt: product.deletedAt,
      updatedBy: product.updatedBy,
      createdAt: product.createdAt,
      updatedAt: product.updatedAt,
    };
  }

  private toResponseDtoWithoutUrl(product: Product): ProductResponseDto {
    return {
      id: product.id,
      name: product.name,
      imageUrl: '',
      status: product.status,
      whitelistUserIds: product.whitelistUserIds,
      isDeleted: product.isDeleted,
      deletedAt: product.deletedAt,
      updatedBy: product.updatedBy,
      createdAt: product.createdAt,
      updatedAt: product.updatedAt,
    };
  }

  private async getImageUrl(
    product: Product,
    userId: string | null,
  ): Promise<string> {
    if (product.status === ProductStatus.PUBLISHED) {
      const publicUrl = process.env.R2_PUBLIC_URL;
      return publicUrl
        ? `${publicUrl}/${product.imageKey}`
        : `${process.env.R2_ENDPOINT}/${process.env.R2_BUCKET}/${product.imageKey}`;
    }

    return this.r2Service.getSignedUrl(product.imageKey, 300);
  }

  private async invalidateCache(): Promise<void> {
    await this.cache.delPattern(`${CACHE_KEY_PREFIX}:*`);
  }

  async importExcel(
    file: Express.Multer.File,
    userId: string,
  ): Promise<ImportJobStatusDto> {
    if (!file) {
      throw new BadRequestException('File is required');
    }

    const workbook = XLSX.read(file.buffer, { type: 'buffer' });

    if (workbook.SheetNames.length === 0) {
      throw new BadRequestException('Excel file contains no sheets');
    }

    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const jsonData: any[] = XLSX.utils.sheet_to_json(worksheet);

    if (jsonData.length === 0) {
      throw new BadRequestException('Excel file contains no data');
    }

    const jobId = uuidv4();
    const job: ImportJob = {
      jobId,
      status: 'pending',
      total: jsonData.length,
      processed: 0,
      successful: 0,
      failed: 0,
      createdProducts: [],
    };
    importJobs.set(jobId, job);

    this.processImportJob(jobId, jsonData, userId).catch((err) => {
      this.logger.error(`Import job ${jobId} failed:`, err);
      const job = importJobs.get(jobId);
      if (job) {
        job.status = 'failed';
        job.error = err.message;
      }
    });

    return this.mapJobToDto(job);
  }

  async getImportStatus(jobId: string): Promise<ImportJobStatusDto> {
    const job = importJobs.get(jobId);
    if (!job) {
      throw new NotFoundException('Import job not found');
    }
    return this.mapJobToDto(job);
  }

  private async processImportJob(
    jobId: string,
    rawData: any[],
    userId: string,
  ): Promise<void> {
    const job = importJobs.get(jobId);
    if (!job) return;

    job.status = 'processing';
    this.logger.log(
      `Starting import job ${jobId} with ${rawData.length} items`,
    );

    const folder = 'products';
    const UPLOAD_BATCH_SIZE = 50;
    const INSERT_BATCH_SIZE = 100;

    const validatedData: Array<{
      name: string;
      imageUrl: string;
      status: ProductStatus;
      whitelistUserIds: string[];
    }> = [];

    for (const row of rawData) {
      const name = row['Tên sản phẩm'] || row['Name'] || row['name'];
      const imageUrl = row['Hình ảnh'] || row['Image URL'] || row['imageUrl'];
      const statusRaw = row['Trạng thái'] || row['Status'] || row['status'];
      const whitelistRaw = row['Whitelist'] || row['whitelist'];

      if (!name || !imageUrl) {
        job.failed++;
        job.processed++;
        continue;
      }

      let status: Status = 'PRIVATE';
      if (statusRaw) {
        const s = statusRaw.toString().trim().toUpperCase();
        if (['PUBLISHED', 'PRIVATE', 'WHITELIST'].includes(s)) {
          status = s;
        }
      }

      let whitelistUserIds: string[] = [];

      if (whitelistRaw && status === 'WHITELIST') {
        whitelistUserIds = whitelistRaw
          .toString()
          .split(',')
          .map((id: string) => id.trim())
          .filter(Boolean);
      }

      validatedData.push({ name, imageUrl, status, whitelistUserIds });
    }

    this.logger.log(
      `Job ${jobId}: Validated ${validatedData.length}/${rawData.length} items`,
    );

    const uploadedItems: Array<{
      name: string;
      imageKey: string;
      status: ProductStatus;
      whitelistUserIds: string[];
    }> = [];

    for (let i = 0; i < validatedData.length; i += UPLOAD_BATCH_SIZE) {
      const batch = validatedData.slice(i, i + UPLOAD_BATCH_SIZE);

      const uploadResults = await Promise.allSettled(
        batch.map(async (item) => {
          const extension =
            item.imageUrl.split('.').pop()?.split('?')[0]?.substring(0, 4) ||
            'jpg';
          const safeExtension = ['jpg', 'png', 'gif', 'webp'].includes(
            extension,
          )
            ? extension
            : 'jpg';
          const imageKey = `${folder}/${uuidv4()}.${safeExtension}`;

          try {
            await this.r2Service.uploadFromUrl(item.imageUrl, folder, imageKey);
            return {
              success: true,
              name: item.name,
              imageKey,
              status: item.status,
              whitelistUserIds: item.whitelistUserIds,
            };
          } catch (err) {
            this.logger.warn(
              `Failed to upload image for "${item.name}": ${err.message}`,
            );
            return { success: false };
          }
        }),
      );

      uploadResults.forEach((result) => {
        if (result.status === 'fulfilled' && result.value.success) {
          uploadedItems.push(result.value as any);
          job.successful++;
        } else {
          job.failed++;
        }
        job.processed++;
      });

      importJobs.set(jobId, job);

      this.logger.log(
        `Job ${jobId}: Processed ${job.processed}/${job.total} (${job.successful} success, ${job.failed} failed)`,
      );
    }

    const createdProducts: Product[] = [];

    for (let i = 0; i < uploadedItems.length; i += INSERT_BATCH_SIZE) {
      const batch = uploadedItems.slice(i, i + INSERT_BATCH_SIZE);

      const productData = batch.map((item) => ({
        name: item.name,
        imageKey: item.imageKey,
        status: item.status,
        whitelistUserIds: item.whitelistUserIds,
        updatedBy: userId,
      }));

      await this.prisma.product.createMany({
        data: productData,
      });

      const batchProducts = await this.prisma.product.findMany({
        where: {
          imageKey: { in: batch.map((item) => item.imageKey) },
        },
      });

      createdProducts.push(...batchProducts);

      this.logger.log(
        `Job ${jobId}: Inserted batch ${Math.floor(i / INSERT_BATCH_SIZE) + 1} (${batch.length} items)`,
      );
    }

    job.status = 'completed';
    job.createdProducts = createdProducts;
    importJobs.set(jobId, job);

    await this.invalidateCache();

    this.logger.log(
      `Job ${jobId} completed: ${job.successful} successful, ${job.failed} failed`,
    );
  }

  private mapJobToDto(job: ImportJob): ImportJobStatusDto {
    const dto: ImportJobStatusDto = {
      jobId: job.jobId,
      status: job.status,
      total: job.total,
      processed: job.processed,
      successful: job.successful,
      failed: job.failed,
    };

    if (job.error) {
      dto.error = job.error;
    }

    if (job.status === 'completed' && job.createdProducts) {
      dto.products = job.createdProducts.map((p) =>
        this.toResponseDtoWithoutUrl(p),
      );
    }

    return dto;
  }

  // ========== Product Reactions (Heart/Like) ==========

  async getReactionState(
    productId: string,
    userId: string,
  ): Promise<{ reacted: boolean; count: number }> {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
    });

    if (!product || product.isDeleted) {
      throw new NotFoundException('Product not found');
    }

    const [reaction, count] = await Promise.all([
      this.prisma.productReaction.findUnique({
        where: { productId_userId: { productId, userId } },
      }),
      this.prisma.productReaction.count({ where: { productId } }),
    ]);

    return { reacted: !!reaction, count };
  }

  async toggleReaction(
    productId: string,
    userId: string,
  ): Promise<{ reacted: boolean; count: number }> {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
    });

    if (!product || product.isDeleted) {
      throw new NotFoundException('Product not found');
    }

    const existing = await this.prisma.productReaction.findUnique({
      where: { productId_userId: { productId, userId } },
    });

    if (existing) {
      await this.prisma.productReaction.delete({ where: { id: existing.id } });

      // Delete notification when user unlikes the product
      await this.notificationService.deleteByMetadata(
        NotificationType.PRODUCT_LIKE,
        { productId },
      );
    } else {
      await this.prisma.productReaction.create({
        data: { productId, userId },
      });

      // Notify admins about product like
      const currentUser = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { username: true },
      });
      if (currentUser) {
        const adminIds = await this.notificationService.getAdminIds();
        await this.notificationService.notifyAdminProductLike(
          adminIds,
          currentUser.username,
          product.name,
          productId,
        );
      }
    }

    const count = await this.prisma.productReaction.count({
      where: { productId },
    });

    await this.invalidateCache();

    // Emit WebSocket event
    this.eventsGateway.emitProductReactionUpdated(productId, {
      count,
      userId,
      reacted: !existing,
    });

    return { reacted: !existing, count };
  }

  async getReactionCount(productId: string): Promise<number> {
    return this.prisma.productReaction.count({ where: { productId } });
  }

  async hasUserReacted(productId: string, userId: string): Promise<boolean> {
    const reaction = await this.prisma.productReaction.findUnique({
      where: { productId_userId: { productId, userId } },
    });
    return !!reaction;
  }

  // ========== Saved Products (Bookmark) ==========

  async getSaveState(
    productId: string,
    userId: string,
  ): Promise<{ saved: boolean }> {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
    });

    if (!product || product.isDeleted) {
      throw new NotFoundException('Product not found');
    }

    const saved = await this.prisma.savedProduct.findUnique({
      where: { productId_userId: { productId, userId } },
    });

    return { saved: !!saved };
  }

  async toggleSaved(
    productId: string,
    userId: string,
  ): Promise<{ saved: boolean }> {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
    });

    if (!product || product.isDeleted) {
      throw new NotFoundException('Product not found');
    }

    const existing = await this.prisma.savedProduct.findUnique({
      where: { productId_userId: { productId, userId } },
    });

    if (existing) {
      await this.prisma.savedProduct.delete({ where: { id: existing.id } });

      // Delete notification when user unsaves the product
      await this.notificationService.deleteByMetadata(
        NotificationType.PRODUCT_SAVE,
        { productId },
      );

      // Emit WebSocket event
      this.eventsGateway.emitProductSavedUpdated(productId, {
        userId,
        saved: false,
      });

      return { saved: false };
    } else {
      await this.prisma.savedProduct.create({
        data: { productId, userId },
      });

      // Emit WebSocket event
      this.eventsGateway.emitProductSavedUpdated(productId, {
        userId,
        saved: true,
      });

      // Notify admins about product save
      const currentUser = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { username: true },
      });
      if (currentUser) {
        const adminIds = await this.notificationService.getAdminIds();
        await this.notificationService.notifyAdminProductSave(
          adminIds,
          currentUser.username,
          product.name,
          productId,
        );
      }

      return { saved: true };
    }
  }

  async getSavedProducts(
    userId: string,
    page: number = 1,
    limit: number = 10,
  ): Promise<PaginatedProductsDto> {
    const where = { userId };
    const total = await this.prisma.savedProduct.count({ where });

    const savedProducts = await this.prisma.savedProduct.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: { product: true },
    });

    const products = savedProducts
      .filter((sp) => !sp.product.isDeleted)
      .map((sp) => sp.product);

    return {
      items: await Promise.all(
        products.map((p) => this.toResponseDto(p, userId)),
      ),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getReactedProducts(
    userId: string,
    page: number = 1,
    limit: number = 10,
  ): Promise<PaginatedProductsDto> {
    const where = { userId };
    const total = await this.prisma.productReaction.count({ where });

    const reactions = await this.prisma.productReaction.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: { product: true },
    });

    const products = reactions
      .filter((r) => !r.product.isDeleted)
      .map((r) => r.product);

    return {
      items: await Promise.all(
        products.map((p) => this.toResponseDto(p, userId)),
      ),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async isProductSaved(productId: string, userId: string): Promise<boolean> {
    const saved = await this.prisma.savedProduct.findUnique({
      where: { productId_userId: { productId, userId } },
    });
    return !!saved;
  }

  // ========== Refresh Image URL ==========

  async refreshImageUrl(
    productId: string,
    userId: string,
  ): Promise<{ url: string }> {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
    });

    if (!product || product.isDeleted) {
      throw new NotFoundException('Product not found');
    }

    // Check access
    await this.checkAccess(product, userId);

    // Get new signed URL
    const url = await this.r2Service.getSignedUrl(product.imageKey);
    return { url };
  }

  private async checkAccess(product: Product, userId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });

    if (user?.role === 'ADMIN') {
      return; // Admin has access to all
    }

    if (product.status === ProductStatus.PRIVATE) {
      throw new ForbiddenException('Access denied');
    }

    if (product.status === ProductStatus.WHITELIST) {
      if (!product.whitelistUserIds.includes(userId)) {
        throw new ForbiddenException('Access denied');
      }
    }
  }
}
