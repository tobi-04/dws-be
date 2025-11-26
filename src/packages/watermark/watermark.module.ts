import { Module } from '@nestjs/common';
import { WatermarkService } from './watermark.service';

@Module({
  providers: [WatermarkService],
  exports: [WatermarkService],
})
export class WatermarkModule {}
