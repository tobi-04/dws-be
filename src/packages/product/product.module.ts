import { Module, forwardRef } from '@nestjs/common';
import { ProductController } from './product.controller';
import { ProductService } from './product.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { R2Module } from '../r2/r2.module';
import { EventsModule } from '../events/events.module';

@Module({
  imports: [PrismaModule, R2Module, forwardRef(() => EventsModule)],
  controllers: [ProductController],
  providers: [ProductService],
  exports: [ProductService],
})
export class ProductModule {}
