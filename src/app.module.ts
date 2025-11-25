import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaService } from './prisma/prisma.service';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './packages/auth/auth.module';
import { R2Module } from './packages/r2/r2.module';
import { ProductModule } from './packages/product/product.module';
import { CacheModule } from './packages/cache/cache.module';
import { UserModule } from './packages/user/user.module';
import { ReviewModule } from './packages/review/review.module';
import { EventsModule } from './packages/events/events.module';
import { StatisticsModule } from './packages/statistics/statistics.module';
import { NotificationModule } from './packages/notification/notification.module';
import { DevToolsModule } from './packages/devtools/devtools.module';

@Module({
  imports: [
    CacheModule,
    PrismaModule,
    AuthModule,
    R2Module,
    ProductModule,
    UserModule,
    ReviewModule,
    EventsModule,
    StatisticsModule,
    NotificationModule,
    DevToolsModule,
  ],
  controllers: [AppController],
  providers: [AppService, PrismaService],
})
export class AppModule {}
