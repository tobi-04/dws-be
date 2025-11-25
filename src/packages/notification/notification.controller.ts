import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  ParseIntPipe,
  DefaultValuePipe,
} from '@nestjs/common';
import { NotificationService } from './notification.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { User } from '../../common/decorators/user.decorator';
import type { JwtUser } from '../../common/interfaces/jwt-user.interface';
import { MarkReadDto, SendNotificationDto } from './dto';

@Controller('notifications')
@UseGuards(JwtAuthGuard, RolesGuard)
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  @Get()
  async findAll(
    @User() user: JwtUser,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
  ) {
    return this.notificationService.findByUser(user.id, page, limit);
  }

  @Get('unread-count')
  async getUnreadCount(@User() user: JwtUser) {
    const count = await this.notificationService.getUnreadCount(user.id);
    return { count };
  }

  @Post('mark-read')
  async markAsRead(@User() user: JwtUser, @Body() dto: MarkReadDto) {
    await this.notificationService.markAsRead(
      user.id,
      dto.notificationId,
      dto.all,
    );
    return { success: true };
  }

  @Delete(':id')
  async delete(@User() user: JwtUser, @Param('id') id: string) {
    await this.notificationService.delete(user.id, id);
    return { success: true };
  }

  // Admin only: send custom notification to a user
  @Post('send')
  @Roles('ADMIN')
  async sendNotification(@Body() dto: SendNotificationDto) {
    const notification = await this.notificationService.create({
      userId: dto.userId,
      type: 'ADMIN_MESSAGE',
      title: dto.title,
      content: dto.content,
    });
    return notification;
  }
}
