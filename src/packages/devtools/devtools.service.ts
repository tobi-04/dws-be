import {
  Injectable,
  Logger,
  Inject,
  forwardRef,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CacheService } from '../cache/cache.service';
import { NotificationService } from '../notification/notification.service';
import { EventsGateway } from '../events/events.gateway';
import {
  LogDevToolsDto,
  DevToolsUserStatsDto,
  PaginatedDevToolsStatsDto,
} from './dto';

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const CACHE_KEY_PREFIX = 'devtools';
const WARNING_THRESHOLD = 10;
const LOCK_THRESHOLD = 15;

@Injectable()
export class DevToolsService {
  private readonly logger = new Logger(DevToolsService.name);

  constructor(
    private prisma: PrismaService,
    private cache: CacheService,
    @Inject(forwardRef(() => NotificationService))
    private notificationService: NotificationService,
    @Inject(forwardRef(() => EventsGateway))
    private eventsGateway: EventsGateway,
  ) {}

  async logDetection(userId: string, dto: LogDevToolsDto): Promise<void> {
    // Check if user is already locked
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { status: true, username: true },
    });

    if (!user) return;

    if (user.status === 'BANNED') {
      throw new ForbiddenException('Account is locked');
    }

    // Create log entry
    await this.prisma.devToolsLog.create({
      data: {
        userId,
        path: dto.path,
        userAgent: dto.userAgent || null,
      },
    });

    // Get today's count for this user
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const todayCount = await this.prisma.devToolsLog.count({
      where: {
        userId,
        createdAt: { gte: todayStart },
      },
    });

    // Check thresholds
    if (todayCount >= LOCK_THRESHOLD) {
      await this.lockUser(userId, user.username);
    } else if (todayCount >= WARNING_THRESHOLD && todayCount < LOCK_THRESHOLD) {
      // Only send warning at exactly 10, 11, 12, 13, 14
      if (todayCount === WARNING_THRESHOLD) {
        await this.sendWarning(userId, user.username, todayCount);
      }
    }

    // Invalidate cache
    await this.invalidateCache(userId);
  }

  private async lockUser(userId: string, username: string): Promise<void> {
    // Lock the user
    await this.prisma.user.update({
      where: { id: userId },
      data: { status: 'BANNED' },
    });

    // Emit account banned event via WebSocket
    this.eventsGateway.emitAccountBanned(userId);

    // Notify user
    await this.notificationService.sendAccountLocked(userId);

    // Notify all admins
    const adminIds = await this.notificationService.getAdminIds();
    await this.notificationService.notifyAdminUserLocked(
      adminIds,
      username,
      userId,
    );

    this.logger.warn(`User ${username} (${userId}) has been locked`);
  }

  private async sendWarning(
    userId: string,
    username: string,
    count: number,
  ): Promise<void> {
    // Notify user
    await this.notificationService.sendWarning(userId, count);

    // Notify all admins
    const adminIds = await this.notificationService.getAdminIds();
    await this.notificationService.notifyAdminUserWarning(
      adminIds,
      username,
      count,
      userId,
    );

    this.logger.warn(
      `Warning sent to user ${username} (${userId}) - ${count} detections today`,
    );
  }

  async getTodayCount(userId: string): Promise<number> {
    const cacheKey = `${CACHE_KEY_PREFIX}:count:${userId}`;

    const cached = await this.cache.get<number>(cacheKey);
    if (cached !== null && cached !== undefined) return cached;

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const count = await this.prisma.devToolsLog.count({
      where: {
        userId,
        createdAt: { gte: todayStart },
      },
    });

    await this.cache.set(cacheKey, count, CACHE_TTL);

    return count;
  }

  async getFrequentUsers(
    page: number = 1,
    limit: number = 20,
  ): Promise<PaginatedDevToolsStatsDto> {
    const cacheKey = `${CACHE_KEY_PREFIX}:frequent:page:${page}:limit:${limit}`;

    const cached = await this.cache.get<PaginatedDevToolsStatsDto>(cacheKey);
    if (cached) return cached;

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    // Get users with >= 10 detections today
    const logs = await this.prisma.devToolsLog.groupBy({
      by: ['userId'],
      where: {
        createdAt: { gte: todayStart },
      },
      _count: { userId: true },
      _max: { createdAt: true },
      having: {
        userId: { _count: { gte: WARNING_THRESHOLD } },
      },
      orderBy: {
        _count: { userId: 'desc' },
      },
    });

    const total = logs.length;
    const paginatedLogs = logs.slice((page - 1) * limit, page * limit);

    // Get user details
    const userIds = paginatedLogs.map((log) => log.userId);
    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, username: true },
    });

    const userMap = new Map(users.map((u) => [u.id, u.username]));

    const data: DevToolsUserStatsDto[] = paginatedLogs.map((log) => ({
      userId: log.userId,
      username: userMap.get(log.userId) || 'Unknown',
      count: log._count.userId,
      lastDetected: log._max.createdAt || new Date(),
    }));

    const result: PaginatedDevToolsStatsDto = {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };

    await this.cache.set(cacheKey, result, CACHE_TTL);

    return result;
  }

  private async invalidateCache(userId: string): Promise<void> {
    await this.cache.del(`${CACHE_KEY_PREFIX}:count:${userId}`);
    await this.cache.delPattern(`${CACHE_KEY_PREFIX}:frequent:*`);
  }
}
