import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DevToolsService } from './devtools.service';

@Injectable()
export class DevToolsScheduler {
  private readonly logger = new Logger(DevToolsScheduler.name);

  constructor(private devToolsService: DevToolsService) {}

  /**
   * Chạy lúc 00:00 mỗi ngày để reset điểm cảnh báo cũ hơn 1 ngày
   */
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async handleResetOldWarningPoints() {
    this.logger.log('Starting scheduled reset of old warning points...');

    try {
      const deletedCount = await this.devToolsService.resetOldWarningPoints();
      this.logger.log(
        `Scheduled reset completed: ${deletedCount} old warning points deleted`,
      );
    } catch (error: unknown) {
      const err = error as Error;
      this.logger.error(
        `Failed to reset old warning points: ${err.message}`,
        err.stack,
      );
    }
  }
}
