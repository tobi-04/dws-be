import { Module, forwardRef } from '@nestjs/common';
import { DevToolsController } from './devtools.controller';
import { DevToolsService } from './devtools.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { CacheModule } from '../cache/cache.module';
import { NotificationModule } from '../notification/notification.module';
import { EventsModule } from '../events/events.module';

@Module({
  imports: [
    PrismaModule,
    CacheModule,
    forwardRef(() => NotificationModule),
    forwardRef(() => EventsModule),
  ],
  controllers: [DevToolsController],
  providers: [DevToolsService],
  exports: [DevToolsService],
})
export class DevToolsModule {}
