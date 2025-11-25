import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CacheService } from '../cache/cache.service';
import { EventsGateway } from '../events/events.gateway';
import { NotificationType, Prisma } from '@prisma/client';
import {
  CreateNotificationDto,
  NotificationResponseDto,
  PaginatedNotificationsDto,
} from './dto';

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const CACHE_KEY_PREFIX = 'notifications';

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    private prisma: PrismaService,
    private cache: CacheService,
    @Inject(forwardRef(() => EventsGateway))
    private eventsGateway: EventsGateway,
  ) {}

  async create(dto: CreateNotificationDto): Promise<NotificationResponseDto> {
    const notification = await this.prisma.notification.create({
      data: {
        userId: dto.userId,
        type: dto.type,
        title: dto.title,
        content: dto.content,
        metadata: (dto.metadata as Prisma.InputJsonValue) || null,
      },
    });

    await this.invalidateCache(dto.userId);

    const responseDto = this.toResponseDto(notification);

    // Emit socket event to user
    this.eventsGateway.emitNotification(dto.userId, responseDto);

    return responseDto;
  }

  async createMany(
    dtos: CreateNotificationDto[],
  ): Promise<NotificationResponseDto[]> {
    const notifications = await Promise.all(
      dtos.map((dto) => this.create(dto)),
    );
    return notifications;
  }

  async findByUser(
    userId: string,
    page: number = 1,
    limit: number = 10,
  ): Promise<PaginatedNotificationsDto> {
    const cacheKey = `${CACHE_KEY_PREFIX}:user:${userId}:page:${page}:limit:${limit}`;

    const cached = await this.cache.get<PaginatedNotificationsDto>(cacheKey);
    if (cached) return cached;

    const skip = (page - 1) * limit;

    const [notifications, total] = await Promise.all([
      this.prisma.notification.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.notification.count({ where: { userId } }),
    ]);

    const result: PaginatedNotificationsDto = {
      data: notifications.map((n) => this.toResponseDto(n)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      hasMore: page * limit < total,
    };

    await this.cache.set(cacheKey, result, CACHE_TTL);

    return result;
  }

  async getUnreadCount(userId: string): Promise<number> {
    const cacheKey = `${CACHE_KEY_PREFIX}:unread:${userId}`;

    const cached = await this.cache.get<number>(cacheKey);
    if (cached !== null && cached !== undefined) return cached;

    const count = await this.prisma.notification.count({
      where: { userId, isRead: false },
    });

    await this.cache.set(cacheKey, count, CACHE_TTL);

    return count;
  }

  async markAsRead(
    userId: string,
    notificationId?: string,
    all?: boolean,
  ): Promise<void> {
    if (all) {
      await this.prisma.notification.updateMany({
        where: { userId, isRead: false },
        data: { isRead: true },
      });
    } else if (notificationId) {
      const notification = await this.prisma.notification.findUnique({
        where: { id: notificationId },
      });

      if (!notification) {
        throw new NotFoundException('Notification not found');
      }

      if (notification.userId !== userId) {
        throw new ForbiddenException('Cannot mark notification as read');
      }

      await this.prisma.notification.update({
        where: { id: notificationId },
        data: { isRead: true },
      });
    }

    await this.invalidateCache(userId);
  }

  async delete(userId: string, notificationId: string): Promise<void> {
    const notification = await this.prisma.notification.findUnique({
      where: { id: notificationId },
    });

    if (!notification) {
      throw new NotFoundException('Notification not found');
    }

    if (notification.userId !== userId) {
      throw new ForbiddenException('Cannot delete this notification');
    }

    await this.prisma.notification.delete({
      where: { id: notificationId },
    });

    await this.invalidateCache(userId);
  }

  // Delete notifications by metadata (e.g., when unlike or delete comment)
  async deleteByMetadata(
    type: NotificationType,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    this.logger.log(
      `[deleteByMetadata] type: ${type}, metadata: ${JSON.stringify(metadata)}`,
    );

    const notifications = await this.prisma.notification.findMany({
      where: { type },
    });

    this.logger.log(
      `[deleteByMetadata] Found ${notifications.length} notifications of type ${type}`,
    );

    // Filter by metadata match
    const toDelete = notifications.filter((n) => {
      if (!n.metadata) return false;
      const meta = n.metadata as Record<string, unknown>;
      const matches = Object.entries(metadata).every(
        ([key, value]) => meta[key] === value,
      );
      if (matches) {
        this.logger.log(
          `[deleteByMetadata] Matched notification ${n.id} with metadata: ${JSON.stringify(meta)}`,
        );
      }
      return matches;
    });

    this.logger.log(
      `[deleteByMetadata] ${toDelete.length} notifications to delete`,
    );

    if (toDelete.length > 0) {
      await this.prisma.notification.deleteMany({
        where: { id: { in: toDelete.map((n) => n.id) } },
      });

      // Group by userId and emit socket events
      const userNotifications = new Map<string, string[]>();
      for (const n of toDelete) {
        if (!userNotifications.has(n.userId)) {
          userNotifications.set(n.userId, []);
        }
        userNotifications.get(n.userId)?.push(n.id);
      }

      // Invalidate cache and emit socket events for all affected users
      for (const [userId, notificationIds] of userNotifications) {
        await this.invalidateCache(userId);
        this.eventsGateway.emitNotificationDeleted(userId, notificationIds);
        this.logger.log(
          `[deleteByMetadata] Emitted notificationDeleted to user ${userId}: ${notificationIds.join(', ')}`,
        );
      }
    }
  }

  // Send notification when someone likes a review
  async notifyReviewLike(
    reviewOwnerId: string,
    likerUsername: string,
    reviewContent: string,
    productId: string,
    reviewId: string,
  ): Promise<void> {
    await this.create({
      userId: reviewOwnerId,
      type: NotificationType.REVIEW_LIKE,
      title: 'Có người thích bình luận của bạn',
      content: `<strong>${likerUsername}</strong> đã thích bình luận của bạn: "${reviewContent.substring(0, 50)}..."`,
      metadata: { productId, reviewId },
    });
  }

  // Send notification when someone reacts (like or dislike) to a review
  async notifyReviewReaction(
    reviewOwnerId: string,
    reactorUsername: string,
    reviewContent: string,
    productId: string,
    reviewId: string,
    isLike: boolean,
  ): Promise<void> {
    const action = isLike ? 'thích' : 'không thích';
    const title = isLike
      ? 'Có người thích bình luận của bạn'
      : 'Có người không thích bình luận của bạn';

    await this.create({
      userId: reviewOwnerId,
      type: NotificationType.REVIEW_LIKE,
      title,
      content: `<strong>${reactorUsername}</strong> đã ${action} bình luận của bạn: "${reviewContent.substring(0, 50)}..."`,
      metadata: { productId, reviewId, isLike },
    });
  }

  // Send notification when someone replies to a review
  async notifyReviewReply(
    reviewOwnerId: string,
    replierUsername: string,
    replyContent: string,
    productId: string,
    reviewId: string,
    parentId: string,
  ): Promise<void> {
    await this.create({
      userId: reviewOwnerId,
      type: NotificationType.REVIEW_REPLY,
      title: 'Có người trả lời bình luận của bạn',
      content: `<strong>${replierUsername}</strong> đã trả lời bình luận của bạn: "${replyContent.substring(0, 50)}..."`,
      metadata: { productId, reviewId, parentId },
    });
  }

  // Send notification to admin when someone likes a product
  async notifyAdminProductLike(
    adminIds: string[],
    username: string,
    productName: string,
    productId: string,
  ): Promise<void> {
    for (const adminId of adminIds) {
      await this.create({
        userId: adminId,
        type: NotificationType.PRODUCT_LIKE,
        title: 'Sản phẩm được yêu thích',
        content: `<strong>${username}</strong> đã thích sản phẩm <strong>${productName}</strong>`,
        metadata: { productId },
      });
    }
  }

  // Send notification to admin when someone comments on a product
  async notifyAdminProductComment(
    adminIds: string[],
    username: string,
    productName: string,
    productId: string,
    reviewId: string,
    commentContent: string,
  ): Promise<void> {
    for (const adminId of adminIds) {
      await this.create({
        userId: adminId,
        type: NotificationType.PRODUCT_COMMENT,
        title: 'Bình luận mới',
        content: `<strong>${username}</strong> đã bình luận trên sản phẩm <strong>${productName}</strong>: "${commentContent.substring(0, 50)}..."`,
        metadata: { productId, reviewId },
      });
    }
  }

  // Send notification to admin when someone saves a product
  async notifyAdminProductSave(
    adminIds: string[],
    username: string,
    productName: string,
    productId: string,
  ): Promise<void> {
    for (const adminId of adminIds) {
      await this.create({
        userId: adminId,
        type: NotificationType.PRODUCT_SAVE,
        title: 'Sản phẩm được lưu',
        content: `<strong>${username}</strong> đã lưu sản phẩm <strong>${productName}</strong>`,
        metadata: { productId },
      });
    }
  }

  // Send warning notification
  async sendWarning(userId: string, count: number): Promise<void> {
    await this.create({
      userId,
      type: NotificationType.WARNING,
      title: '⚠️ Cảnh báo bảo mật',
      content: `Bạn đã sử dụng Developer Tools ${count} lần trong ngày hôm nay. Nếu tiếp tục vượt quá 15 lần, tài khoản của bạn sẽ bị khóa tự động.`,
    });
  }

  // Send account locked notification
  async sendAccountLocked(userId: string): Promise<void> {
    await this.create({
      userId,
      type: NotificationType.ACCOUNT_LOCKED,
      title: '🔒 Tài khoản đã bị khóa',
      content:
        'Tài khoản của bạn đã bị khóa do vi phạm chính sách bảo mật (sử dụng Developer Tools quá 15 lần trong ngày). Vui lòng liên hệ admin để được hỗ trợ.',
    });
  }

  // Notify admins about user warning/lock
  async notifyAdminUserWarning(
    adminIds: string[],
    username: string,
    count: number,
    userId: string,
  ): Promise<void> {
    for (const adminId of adminIds) {
      await this.create({
        userId: adminId,
        type: NotificationType.SYSTEM,
        title: '⚠️ Cảnh báo người dùng',
        content: `Người dùng <strong>${username}</strong> đã sử dụng Developer Tools ${count} lần trong ngày hôm nay.`,
        metadata: { targetUserId: userId },
      });
    }
  }

  async notifyAdminUserLocked(
    adminIds: string[],
    username: string,
    userId: string,
  ): Promise<void> {
    for (const adminId of adminIds) {
      await this.create({
        userId: adminId,
        type: NotificationType.SYSTEM,
        title: '🔒 Tài khoản bị khóa tự động',
        content: `Tài khoản của người dùng <strong>${username}</strong> đã bị khóa tự động do vi phạm chính sách bảo mật.`,
        metadata: { targetUserId: userId },
      });
    }
  }

  // Get all admin ids
  async getAdminIds(): Promise<string[]> {
    const admins = await this.prisma.user.findMany({
      where: { role: 'ADMIN' },
      select: { id: true },
    });
    return admins.map((a) => a.id);
  }

  private toResponseDto(notification: {
    id: string;
    userId: string;
    type: NotificationType;
    title: string;
    content: string;
    isRead: boolean;
    metadata: unknown;
    createdAt: Date;
  }): NotificationResponseDto {
    return {
      id: notification.id,
      userId: notification.userId,
      type: notification.type,
      title: notification.title,
      content: notification.content,
      isRead: notification.isRead,
      metadata: notification.metadata as Record<string, unknown> | null,
      createdAt: notification.createdAt,
    };
  }

  private async invalidateCache(userId: string): Promise<void> {
    await this.cache.delPattern(`${CACHE_KEY_PREFIX}:user:${userId}:*`);
    await this.cache.del(`${CACHE_KEY_PREFIX}:unread:${userId}`);
  }
}
