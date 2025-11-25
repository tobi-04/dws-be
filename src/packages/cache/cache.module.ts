import { Module, Global, Logger } from '@nestjs/common';
import { CacheModule as NestCacheModule } from '@nestjs/cache-manager';
import { CacheService } from './cache.service';
import { redisStore } from 'cache-manager-ioredis-yet';
import { redisConfig } from '../../config/redis.config';

const logger = new Logger('CacheModule');

@Global()
@Module({
  imports: [
    NestCacheModule.registerAsync({
      useFactory: async () => {
        logger.log(
          `Attempting to connect to Redis at ${redisConfig.host}:${redisConfig.port}`,
        );

        const store = await redisStore({
          host: redisConfig.host,
          port: redisConfig.port,
          password: redisConfig.password,
          db: redisConfig.db,
          keyPrefix: redisConfig.keyPrefix,
        });

        logger.log(
          `Redis connected successfully at ${redisConfig.host}:${redisConfig.port} (DB: ${redisConfig.db}, Prefix: ${redisConfig.keyPrefix})`,
        );

        return {
          store: store as any,
          ttl: 300000, // 5 minutes default
        };
      },
    }),
  ],
  providers: [CacheService],
  exports: [CacheService],
})
export class CacheModule {}
