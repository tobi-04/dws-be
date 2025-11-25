import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface ProductStats {
  id: string;
  name: string;
  imageKey: string;
  count: number;
}

export interface OverviewStats {
  totalProducts: number;
  totalViews: number;
  totalReactions: number;
  totalSaves: number;
  totalReviews: number;
  totalUsers: number;
}

export interface ChartData {
  topViewedProducts: ProductStats[];
  topReactedProducts: ProductStats[];
  topSavedProducts: ProductStats[];
  topCommentedProducts: ProductStats[];
  viewsByDate: { date: string; count: number }[];
  reactionsByDate: { date: string; count: number }[];
}

@Injectable()
export class StatisticsService {
  constructor(private prisma: PrismaService) {}

  async getOverviewStats(): Promise<OverviewStats> {
    const [
      totalProducts,
      totalViews,
      totalReactions,
      totalSaves,
      totalReviews,
      totalUsers,
    ] = await Promise.all([
      this.prisma.product.count({ where: { isDeleted: false } }),
      this.prisma.productView.count(),
      this.prisma.productReaction.count(),
      this.prisma.savedProduct.count(),
      this.prisma.review.count(),
      this.prisma.user.count(),
    ]);

    return {
      totalProducts,
      totalViews,
      totalReactions,
      totalSaves,
      totalReviews,
      totalUsers,
    };
  }

  async getTopViewedProducts(limit: number = 10): Promise<ProductStats[]> {
    const result = await this.prisma.productView.groupBy({
      by: ['productId'],
      _count: { productId: true },
      orderBy: { _count: { productId: 'desc' } },
      take: limit,
    });

    const productIds = result.map((r) => r.productId);
    const products = await this.prisma.product.findMany({
      where: { id: { in: productIds }, isDeleted: false },
      select: { id: true, name: true, imageKey: true },
    });

    const productMap = new Map(products.map((p) => [p.id, p]));

    return result
      .map((r) => {
        const product = productMap.get(r.productId);
        if (!product) return null;
        return {
          id: product.id,
          name: product.name,
          imageKey: product.imageKey,
          count: r._count.productId,
        };
      })
      .filter((p): p is ProductStats => p !== null);
  }

  async getTopReactedProducts(limit: number = 10): Promise<ProductStats[]> {
    const result = await this.prisma.productReaction.groupBy({
      by: ['productId'],
      _count: { productId: true },
      orderBy: { _count: { productId: 'desc' } },
      take: limit,
    });

    const productIds = result.map((r) => r.productId);
    const products = await this.prisma.product.findMany({
      where: { id: { in: productIds }, isDeleted: false },
      select: { id: true, name: true, imageKey: true },
    });

    const productMap = new Map(products.map((p) => [p.id, p]));

    return result
      .map((r) => {
        const product = productMap.get(r.productId);
        if (!product) return null;
        return {
          id: product.id,
          name: product.name,
          imageKey: product.imageKey,
          count: r._count.productId,
        };
      })
      .filter((p): p is ProductStats => p !== null);
  }

  async getTopSavedProducts(limit: number = 10): Promise<ProductStats[]> {
    const result = await this.prisma.savedProduct.groupBy({
      by: ['productId'],
      _count: { productId: true },
      orderBy: { _count: { productId: 'desc' } },
      take: limit,
    });

    const productIds = result.map((r) => r.productId);
    const products = await this.prisma.product.findMany({
      where: { id: { in: productIds }, isDeleted: false },
      select: { id: true, name: true, imageKey: true },
    });

    const productMap = new Map(products.map((p) => [p.id, p]));

    return result
      .map((r) => {
        const product = productMap.get(r.productId);
        if (!product) return null;
        return {
          id: product.id,
          name: product.name,
          imageKey: product.imageKey,
          count: r._count.productId,
        };
      })
      .filter((p): p is ProductStats => p !== null);
  }

  async getTopCommentedProducts(limit: number = 10): Promise<ProductStats[]> {
    const result = await this.prisma.review.groupBy({
      by: ['productId'],
      _count: { productId: true },
      orderBy: { _count: { productId: 'desc' } },
      take: limit,
    });

    const productIds = result.map((r) => r.productId);
    const products = await this.prisma.product.findMany({
      where: { id: { in: productIds }, isDeleted: false },
      select: { id: true, name: true, imageKey: true },
    });

    const productMap = new Map(products.map((p) => [p.id, p]));

    return result
      .map((r) => {
        const product = productMap.get(r.productId);
        if (!product) return null;
        return {
          id: product.id,
          name: product.name,
          imageKey: product.imageKey,
          count: r._count.productId,
        };
      })
      .filter((p): p is ProductStats => p !== null);
  }

  async getViewsByDate(
    days: number = 30,
  ): Promise<{ date: string; count: number }[]> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const views = await this.prisma.productView.findMany({
      where: { createdAt: { gte: startDate } },
      select: { createdAt: true },
    });

    const countByDate = new Map<string, number>();

    for (let i = 0; i <= days; i++) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0] as string;
      countByDate.set(dateStr, 0);
    }

    views.forEach((v) => {
      const dateStr = v.createdAt.toISOString().split('T')[0] as string;
      countByDate.set(dateStr, (countByDate.get(dateStr) || 0) + 1);
    });

    return Array.from(countByDate.entries())
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  async getReactionsByDate(
    days: number = 30,
  ): Promise<{ date: string; count: number }[]> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const reactions = await this.prisma.productReaction.findMany({
      where: { createdAt: { gte: startDate } },
      select: { createdAt: true },
    });

    const countByDate = new Map<string, number>();

    for (let i = 0; i <= days; i++) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0] as string;
      countByDate.set(dateStr, 0);
    }

    reactions.forEach((r) => {
      const dateStr = r.createdAt.toISOString().split('T')[0] as string;
      countByDate.set(dateStr, (countByDate.get(dateStr) || 0) + 1);
    });

    return Array.from(countByDate.entries())
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  async getChartData(
    limit: number = 10,
    days: number = 30,
  ): Promise<ChartData> {
    const [
      topViewedProducts,
      topReactedProducts,
      topSavedProducts,
      topCommentedProducts,
      viewsByDate,
      reactionsByDate,
    ] = await Promise.all([
      this.getTopViewedProducts(limit),
      this.getTopReactedProducts(limit),
      this.getTopSavedProducts(limit),
      this.getTopCommentedProducts(limit),
      this.getViewsByDate(days),
      this.getReactionsByDate(days),
    ]);

    return {
      topViewedProducts,
      topReactedProducts,
      topSavedProducts,
      topCommentedProducts,
      viewsByDate,
      reactionsByDate,
    };
  }

  // Record a product view by session
  async recordView(
    productId: string,
    sessionId: string,
    userId?: string,
  ): Promise<void> {
    try {
      await this.prisma.productView.upsert({
        where: { productId_sessionId: { productId, sessionId } },
        create: { productId, sessionId, userId },
        update: {}, // Don't update if exists
      });
    } catch {
      // Ignore duplicate errors
    }
  }
}
