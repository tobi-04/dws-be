import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  UseGuards,
  ParseIntPipe,
  DefaultValuePipe,
} from '@nestjs/common';
import { DevToolsService } from './devtools.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { User } from '../../common/decorators/user.decorator';
import type { JwtUser } from '../../common/interfaces/jwt-user.interface';
import { LogDevToolsDto } from './dto';

@Controller('devtools')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DevToolsController {
  constructor(private readonly devToolsService: DevToolsService) {}

  @Post('log')
  async logDetection(@User() user: JwtUser, @Body() dto: LogDevToolsDto) {
    await this.devToolsService.logDetection(user.id, dto);
    return { success: true };
  }

  @Get('today-count')
  async getTodayCount(@User() user: JwtUser) {
    const count = await this.devToolsService.getTodayCount(user.id);
    return { count };
  }

  // Admin only: get frequent DevTools users
  @Get('frequent-users')
  @Roles('ADMIN')
  async getFrequentUsers(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.devToolsService.getFrequentUsers(page, limit);
  }
}
