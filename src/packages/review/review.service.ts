import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CacheService } from '../cache/cache.service';
import { EventsGateway } from '../events/events.gateway';
import { NotificationService } from '../notification/notification.service';
import {
  CreateReviewDto,
  UpdateReviewDto,
  ReviewResponseDto,
  PaginatedReviewsDto,
} from './dto';
import { NotificationType } from '@prisma/client';
import type { Review, ReviewLike } from '@prisma/client';

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const CACHE_KEY_PREFIX = 'reviews';

type ReviewWithRelations = Review & {
  user: { username: string };
  likes: ReviewLike[];
  replies?: ReviewWithRelations[];
  _count?: { replies: number };
};

@Injectable()
export class ReviewService {
  constructor(
    private prisma: PrismaService,
    private cache: CacheService,
    @Inject(forwardRef(() => EventsGateway))
    private eventsGateway: EventsGateway,
    @Inject(forwardRef(() => NotificationService))
    private notificationService: NotificationService,
  ) {}

  async create(
    dto: CreateReviewDto,
    userId: string,
  ): Promise<ReviewResponseDto> {
    // Check if product exists
    const product = await this.prisma.product.findUnique({
      where: { id: dto.productId },
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    if (product.isDeleted) {
      throw new BadRequestException('Cannot review deleted product');
    }

    // Get current user for notification
    const currentUser = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { username: true },
    });

    // If it's a reply, check if parent exists
    let parentReview: Review | null = null;
    if (dto.parentId) {
      parentReview = await this.prisma.review.findUnique({
        where: { id: dto.parentId },
      });
      if (!parentReview || parentReview.productId !== dto.productId) {
        throw new BadRequestException('Invalid parent review');
      }
    }

    // Sanitize HTML content
    const sanitizedContent = this.sanitizeHtml(dto.content);

    const review = await this.prisma.review.create({
      data: {
        content: sanitizedContent,
        userId,
        productId: dto.productId,
        parentId: dto.parentId || null,
      },
      include: {
        user: { select: { username: true } },
        likes: true,
        _count: { select: { replies: true } },
      },
    });

    await this.invalidateCache(dto.productId);

    const responseDto = this.toResponseDto(
      review as ReviewWithRelations,
      userId,
    );

    // Emit WebSocket event for new review
    this.eventsGateway.emitNewReview(dto.productId, responseDto);

    // Send notification to parent review owner if this is a reply
    if (parentReview && parentReview.userId !== userId && currentUser) {
      await this.notificationService.notifyReviewReply(
        parentReview.userId,
        currentUser.username,
        sanitizedContent,
        dto.productId,
        review.id,
        parentReview.id,
      );
    }

    // Notify admins about new comment
    if (currentUser) {
      const adminIds = await this.notificationService.getAdminIds();
      await this.notificationService.notifyAdminProductComment(
        adminIds,
        currentUser.username,
        product.name,
        dto.productId,
        review.id,
        sanitizedContent,
      );
    }

    return responseDto;
  }

  async update(
    id: string,
    dto: UpdateReviewDto,
    userId: string,
  ): Promise<ReviewResponseDto> {
    const review = await this.prisma.review.findUnique({
      where: { id },
      include: {
        user: { select: { username: true } },
        likes: true,
      },
    });

    if (!review) {
      throw new NotFoundException('Review not found');
    }

    if (review.userId !== userId) {
      throw new ForbiddenException('You can only edit your own reviews');
    }

    const sanitizedContent = dto.content
      ? this.sanitizeHtml(dto.content)
      : review.content;

    const updated = await this.prisma.review.update({
      where: { id },
      data: { content: sanitizedContent },
      include: {
        user: { select: { username: true } },
        likes: true,
        _count: { select: { replies: true } },
      },
    });

    await this.invalidateCache(review.productId);

    const responseDto = this.toResponseDto(
      updated as ReviewWithRelations,
      userId,
    );

    // Emit WebSocket event for updated review
    this.eventsGateway.emitReviewUpdated(review.productId, responseDto);

    return responseDto;
  }

  async delete(id: string, userId: string, isAdmin: boolean): Promise<void> {
    const review = await this.prisma.review.findUnique({
      where: { id },
    });

    if (!review) {
      throw new NotFoundException('Review not found');
    }

    // Users can only delete their own reviews, admins can delete any
    if (!isAdmin && review.userId !== userId) {
      throw new ForbiddenException('You can only delete your own reviews');
    }

    console.log(
      `[DELETE REVIEW] Deleting review ${id}, productId: ${review.productId}`,
    );

    // Delete all likes first
    await this.prisma.reviewLike.deleteMany({ where: { reviewId: id } });

    // Delete all replies if it's a parent review
    const replies = await this.prisma.review.findMany({
      where: { parentId: id },
    });
    for (const reply of replies) {
      await this.prisma.reviewLike.deleteMany({
        where: { reviewId: reply.id },
      });
      // Delete notifications for replies
      await this.notificationService.deleteByMetadata(
        NotificationType.REVIEW_LIKE,
        { reviewId: reply.id },
      );
      await this.notificationService.deleteByMetadata(
        NotificationType.REVIEW_REPLY,
        { reviewId: reply.id },
      );
      // Delete PRODUCT_COMMENT notification for reply
      await this.notificationService.deleteByMetadata(
        NotificationType.PRODUCT_COMMENT,
        { reviewId: reply.id },
      );
    }
    await this.prisma.review.deleteMany({ where: { parentId: id } });

    // Delete notifications for this review (like, reply, and comment notifications)
    console.log(
      `[DELETE REVIEW] Deleting REVIEW_LIKE notifications for reviewId: ${id}`,
    );
    await this.notificationService.deleteByMetadata(
      NotificationType.REVIEW_LIKE,
      { reviewId: id },
    );

    console.log(
      `[DELETE REVIEW] Deleting REVIEW_REPLY notifications for reviewId: ${id}`,
    );
    await this.notificationService.deleteByMetadata(
      NotificationType.REVIEW_REPLY,
      { reviewId: id },
    );

    // Delete PRODUCT_COMMENT notification (admin notification)
    console.log(
      `[DELETE REVIEW] Deleting PRODUCT_COMMENT notifications for reviewId: ${id}`,
    );
    await this.notificationService.deleteByMetadata(
      NotificationType.PRODUCT_COMMENT,
      { reviewId: id },
    );

    // If this is a reply, also delete the reply notification with parentId
    if (review.parentId) {
      await this.notificationService.deleteByMetadata(
        NotificationType.REVIEW_REPLY,
        {
          parentId: review.parentId,
          reviewId: id,
        },
      );
    }

    // Delete the review
    await this.prisma.review.delete({ where: { id } });

    await this.invalidateCache(review.productId);

    // Emit WebSocket event for deleted review
    this.eventsGateway.emitReviewDeleted(review.productId, id);
    console.log(`[DELETE REVIEW] Review ${id} deleted successfully`);
  }

  async toggleHidden(
    id: string,
    isHidden: boolean,
  ): Promise<ReviewResponseDto> {
    const review = await this.prisma.review.findUnique({
      where: { id },
    });

    if (!review) {
      throw new NotFoundException('Review not found');
    }

    const updated = await this.prisma.review.update({
      where: { id },
      data: { isHidden },
      include: {
        user: { select: { username: true } },
        likes: true,
        _count: { select: { replies: true } },
      },
    });

    await this.invalidateCache(review.productId);

    // Emit WebSocket event for visibility change
    this.eventsGateway.emitReviewVisibilityChanged(
      review.productId,
      id,
      isHidden,
    );

    return this.toResponseDto(updated as ReviewWithRelations);
  }

  async likeReview(
    reviewId: string,
    userId: string,
    isLike: boolean,
  ): Promise<{
    likes: number;
    dislikes: number;
    userReaction: boolean | null;
  }> {
    const review = await this.prisma.review.findUnique({
      where: { id: reviewId },
      include: { user: { select: { username: true } } },
    });

    if (!review) {
      throw new NotFoundException('Review not found');
    }

    // Get current user for notification
    const currentUser = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { username: true },
    });

    console.log(
      `[LIKE REVIEW] reviewId: ${reviewId}, userId: ${userId}, isLike: ${isLike}`,
    );

    // Check if user already has a reaction
    const existing = await this.prisma.reviewLike.findUnique({
      where: { reviewId_userId: { reviewId, userId } },
    });

    let isNewReaction = false;
    let shouldDeleteNotification = false;
    if (existing) {
      console.log(
        `[LIKE REVIEW] Existing reaction: ${existing.isLike}, new: ${isLike}`,
      );
      if (existing.isLike === isLike) {
        // Remove reaction if same (toggle off)
        await this.prisma.reviewLike.delete({
          where: { id: existing.id },
        });
        // Delete notification when removing reaction
        shouldDeleteNotification = true;
        console.log(`[LIKE REVIEW] Removed reaction, will delete notification`);
      } else {
        // Update reaction (switch from like to dislike or vice versa)
        await this.prisma.reviewLike.update({
          where: { id: existing.id },
          data: { isLike },
        });
        // Delete old notification and create new one
        shouldDeleteNotification = true;
        isNewReaction = true;
        console.log(
          `[LIKE REVIEW] Changed reaction, will delete old and create new notification`,
        );
      }
    } else {
      // Create new reaction
      await this.prisma.reviewLike.create({
        data: { reviewId, userId, isLike },
      });
      isNewReaction = true;
      console.log(`[LIKE REVIEW] Created new reaction`);
    }

    // Delete notification if needed
    if (shouldDeleteNotification && review.userId !== userId) {
      console.log(`[LIKE REVIEW] Deleting REVIEW_LIKE notification`);
      await this.notificationService.deleteByMetadata(
        NotificationType.REVIEW_LIKE,
        { reviewId },
      );
    }

    // Get updated counts
    const [likes, dislikes] = await Promise.all([
      this.prisma.reviewLike.count({ where: { reviewId, isLike: true } }),
      this.prisma.reviewLike.count({ where: { reviewId, isLike: false } }),
    ]);

    const userReaction = await this.prisma.reviewLike.findUnique({
      where: { reviewId_userId: { reviewId, userId } },
    });

    // Send notification to review owner for both like AND dislike (not themselves)
    if (isNewReaction && review.userId !== userId && currentUser) {
      console.log(
        `[LIKE REVIEW] Sending notification: isLike=${isLike}, to=${review.userId}`,
      );
      await this.notificationService.notifyReviewReaction(
        review.userId,
        currentUser.username,
        review.content,
        review.productId,
        reviewId,
        isLike,
      );
    }

    await this.invalidateCache(review.productId);

    const result = {
      likes,
      dislikes,
      userReaction: userReaction?.isLike ?? null,
    };

    // Emit WebSocket event for review like/dislike update
    this.eventsGateway.emitReviewUpdated(review.productId, {
      id: reviewId,
      likes,
      dislikes,
      userReaction: result.userReaction,
    });

    return result;
  }

  async findByProduct(
    productId: string,
    page: number = 1,
    limit: number = 10,
    userId?: string,
    includeHidden: boolean = false,
  ): Promise<PaginatedReviewsDto> {
    const cacheKey = `${CACHE_KEY_PREFIX}:product:${productId}:page:${page}:limit:${limit}:hidden:${includeHidden}`;

    if (!userId) {
      const cached = await this.cache.get<PaginatedReviewsDto>(cacheKey);
      if (cached) return cached;
    }

    const product = await this.prisma.product.findUnique({
      where: { id: productId },
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    const where = {
      productId,
      parentId: null, // Only top-level reviews
      ...(includeHidden ? {} : { isHidden: false }),
    };

    const total = await this.prisma.review.count({ where });
    const reviews = await this.prisma.review.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { username: true } },
        likes: true,
        replies: {
          where: includeHidden ? {} : { isHidden: false },
          include: {
            user: { select: { username: true } },
            likes: true,
          },
          orderBy: { createdAt: 'asc' },
        },
        _count: { select: { replies: true } },
      },
    });

    const result: PaginatedReviewsDto = {
      items: reviews.map((r) =>
        this.toResponseDto(r as ReviewWithRelations, userId),
      ),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };

    if (!userId) {
      await this.cache.set(cacheKey, result, CACHE_TTL);
    }

    return result;
  }

  async findOne(id: string, userId?: string): Promise<ReviewResponseDto> {
    const review = await this.prisma.review.findUnique({
      where: { id },
      include: {
        user: { select: { username: true } },
        likes: true,
        replies: {
          include: {
            user: { select: { username: true } },
            likes: true,
          },
          orderBy: { createdAt: 'asc' },
        },
        _count: { select: { replies: true } },
      },
    });

    if (!review) {
      throw new NotFoundException('Review not found');
    }

    return this.toResponseDto(review as ReviewWithRelations, userId);
  }

  private toResponseDto(
    review: ReviewWithRelations,
    currentUserId?: string,
  ): ReviewResponseDto {
    const likes = review.likes?.filter((l) => l.isLike).length || 0;
    const dislikes = review.likes?.filter((l) => !l.isLike).length || 0;
    const userReaction = currentUserId
      ? (review.likes?.find((l) => l.userId === currentUserId)?.isLike ?? null)
      : null;

    return {
      id: review.id,
      content: review.content,
      userId: review.userId,
      username: review.user.username,
      productId: review.productId,
      parentId: review.parentId,
      isHidden: review.isHidden,
      likes,
      dislikes,
      userReaction,
      replyCount: review._count?.replies || 0,
      replies: review.replies?.map((r) => this.toResponseDto(r, currentUserId)),
      createdAt: review.createdAt,
      updatedAt: review.updatedAt,
    };
  }

  private sanitizeHtml(html: string): string {
    const allowedTags = [
      'p',
      'strong',
      'em',
      'u',
      's',
      'ul',
      'ol',
      'li',
      'blockquote',
      'br',
      'hr',
    ];
    const tagPattern = new RegExp(
      `<(?!\\/?(?:${allowedTags.join('|')})(?:\\s|>|$))/?[^>]*>`,
      'gi',
    );
    let sanitized = html.replace(tagPattern, '');
    sanitized = sanitized.replace(/\s*on\w+\s*=\s*["'][^"']*["']/gi, '');
    sanitized = sanitized.replace(/javascript:/gi, '');
    sanitized = sanitized.replace(/data:/gi, '');
    return sanitized;
  }

  private async invalidateCache(productId: string): Promise<void> {
    await this.cache.delPattern(`${CACHE_KEY_PREFIX}:product:${productId}:*`);
  }
}
