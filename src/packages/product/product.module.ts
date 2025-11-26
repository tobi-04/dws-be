import { Module, forwardRef } from '@nestjs/common';
import { ProductController } from './product.controller';
import { ProductService } from './product.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { R2Module } from '../r2/r2.module';
import { EventsModule } from '../events/events.module';
import { NotificationModule } from '../notification/notification.module';
import { CacheModule } from '../cache/cache.module';
import { WatermarkModule } from '../watermark/watermark.module';

@Module({
  imports: [
    PrismaModule,
    R2Module,
    CacheModule,
    WatermarkModule,
    forwardRef(() => EventsModule),
    forwardRef(() => NotificationModule),
  ],
  controllers: [ProductController],
  providers: [ProductService],
  exports: [ProductService],
})
export class ProductModule {}
