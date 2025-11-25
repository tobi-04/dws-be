import {
  Injectable,
  NotFoundException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CacheService } from '../cache/cache.service';
import { EventsGateway } from '../events/events.gateway';
import type { User, UserStatus } from '@prisma/client';
import type { UserResponseDto, PaginatedUsersDto } from './dto';

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const CACHE_KEY_PREFIX = 'users:list';

@Injectable()
export class UserService {
  constructor(
    private prisma: PrismaService,
    private cache: CacheService,
    @Inject(forwardRef(() => EventsGateway))
    private eventsGateway: EventsGateway,
  ) {}

  async findAll(
    page: number = 1,
    limit: number = 30,
    search?: string,
    status?: UserStatus,
  ): Promise<PaginatedUsersDto> {
    const cacheKey = `${CACHE_KEY_PREFIX}:page:${page}:limit:${limit}:search:${search || ''}:status:${status || ''}`;
    const cached = await this.cache.get<PaginatedUsersDto>(cacheKey);

    if (cached) {
      return cached;
    }

    const where: any = {
      role: { not: 'ADMIN' },
    };

    if (search) {
      where.username = { contains: search };
    }

    if (status) {
      where.status = status;
    }

    if (page === 0) {
      const users = await this.prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
      });

      const result: PaginatedUsersDto = {
        items: users.map((u) => this.toResponseDto(u)),
        meta: {
          total: users.length,
          page: 0,
          limit: users.length,
          totalPages: 1,
        },
      };

      await this.cache.set(cacheKey, result, CACHE_TTL);
      return result;
    }

    const total = await this.prisma.user.count({ where });
    const users = await this.prisma.user.findMany({
      where,
      skip: (Number(page) - 1) * Number(limit),
      take: Number(limit),
      orderBy: { createdAt: 'desc' },
    });

    const result: PaginatedUsersDto = {
      items: users.map((u) => this.toResponseDto(u)),
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

  async lockUser(id: string): Promise<UserResponseDto> {
    const user = await this.prisma.user.findUnique({ where: { id } });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const updated = await this.prisma.user.update({
      where: { id },
      data: { status: 'BANNED' },
    });

    // Emit account banned event via WebSocket
    this.eventsGateway.emitAccountBanned(id);

    await this.invalidateCache();
    return this.toResponseDto(updated);
  }

  async unlockUser(id: string): Promise<UserResponseDto> {
    const user = await this.prisma.user.findUnique({ where: { id } });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const updated = await this.prisma.user.update({
      where: { id },
      data: { status: 'NORMAL' },
    });

    await this.invalidateCache();
    return this.toResponseDto(updated);
  }

  async search(username: string): Promise<UserResponseDto[]> {
    const users = await this.prisma.user.findMany({
      where: {
        username: {
          contains: username,
        },
      },
      take: 10,
    });

    return users.map((u) => this.toResponseDto(u));
  }

  private toResponseDto(user: User): UserResponseDto {
    return {
      id: user.id,
      username: user.username,
      role: user.role,
      status: user.status,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  private async invalidateCache(): Promise<void> {
    await this.cache.delPattern(`${CACHE_KEY_PREFIX}:*`);
  }
}
