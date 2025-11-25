import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';

@Injectable()
export class CacheService implements OnModuleInit {
  private readonly logger = new Logger(CacheService.name);
  private isRedis = false;
  private redisClient: any = null;

  constructor(@Inject(CACHE_MANAGER) private cacheManager: Cache) {}

  onModuleInit() {
    const cacheAny = this.cacheManager as any;

    this.logger.debug(`CacheManager has stores: ${!!cacheAny.stores}`);

    if (cacheAny.stores && Array.isArray(cacheAny.stores)) {
      this.logger.debug(`Number of stores: ${cacheAny.stores.length}`);

      cacheAny.stores.forEach((store: any, index: number) => {
        this.logger.debug(
          `Store ${index} keys: ${JSON.stringify(Object.keys(store || {}).slice(0, 5))}`,
        );
        if (store._store) {
          this.logger.debug(
            `Store ${index} has _store, checking if it's Redis...`,
          );
          const innerStore = store._store;
          if (
            typeof innerStore.scan === 'function' ||
            typeof innerStore.keys === 'function'
          ) {
            this.logger.debug(`Store ${index}._store is Redis!`);
            if (!this.redisClient) {
              this.redisClient = innerStore;
            }
          }
        }
      });
    }

    let client: any = null;

    if (
      cacheAny.stores &&
      Array.isArray(cacheAny.stores) &&
      cacheAny.stores.length > 0
    ) {
      const firstStore = cacheAny.stores[0];

      if (firstStore._store) {
        client = firstStore._store;
        this.logger.debug(`Found Redis client via _store property`);
      } else if (firstStore.client) {
        client = firstStore.client;
        this.logger.debug(`Found client via store.client`);
      } else if (typeof firstStore.getClient === 'function') {
        client = firstStore.getClient();
        this.logger.debug(`Found client via store.getClient()`);
      }
    }

    if (
      client &&
      (typeof client.scan === 'function' || typeof client.keys === 'function')
    ) {
      this.redisClient = client;
      this.isRedis = true;
      this.logger.log('🚀 CacheService initialized with REDIS store');
    } else {
      this.isRedis = false;
      this.logger.warn(
        '🚀 CacheService initialized with MEMORY store (pattern deletion disabled)',
      );
    }
  }

  async get<T>(key: string): Promise<T | undefined> {
    return this.cacheManager.get<T>(key);
  }

  async set(key: string, value: unknown, ttl?: number): Promise<void> {
    await this.cacheManager.set(key, value, ttl);
    this.logger.debug(`Set cache key: ${key}, TTL: ${ttl}`);

    if (
      this.isRedis &&
      this.redisClient &&
      typeof this.redisClient.exists === 'function'
    ) {
      const prefixedKey = `dws:${key}`;
      const exists = await this.redisClient.exists(prefixedKey);
      this.logger.debug(`Key ${prefixedKey} exists in Redis: ${exists}`);
    }
  }

  async del(key: string): Promise<void> {
    await this.cacheManager.del(key);
  }

  async delPattern(pattern: string): Promise<void> {
    try {
      await (this.cacheManager as any).clear();
      this.logger.log(`Cleared ALL cache (triggered by pattern: ${pattern})`);
    } catch (error) {
      this.logger.error(
        `Failed to clear cache: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }
}
