import { Module, forwardRef } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { DevToolsController } from './devtools.controller';
import { DevToolsService } from './devtools.service';
import { DevToolsScheduler } from './devtools.scheduler';
import { PrismaModule } from '../../prisma/prisma.module';
import { CacheModule } from '../cache/cache.module';
import { NotificationModule } from '../notification/notification.module';
import { EventsModule } from '../events/events.module';

@Module({
  imports: [
    PrismaModule,
    CacheModule,
    ScheduleModule.forRoot(),
    forwardRef(() => NotificationModule),
    forwardRef(() => EventsModule),
  ],
  controllers: [DevToolsController],
  providers: [DevToolsService, DevToolsScheduler],
  exports: [DevToolsService],
})
export class DevToolsModule {}
