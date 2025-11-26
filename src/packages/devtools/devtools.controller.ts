import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Query,
  Param,
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
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';

@ApiTags('devtools')
@Controller('devtools')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth('JWT-auth')
export class DevToolsController {
  constructor(private readonly devToolsService: DevToolsService) {}

  @Post('log')
  @ApiOperation({ summary: 'Log DevTools detection' })
  async logDetection(@User() user: JwtUser, @Body() dto: LogDevToolsDto) {
    await this.devToolsService.logDetection(user.id, dto);
    return { success: true };
  }

  @Get('today-count')
  @ApiOperation({ summary: 'Get today detection count for current user' })
  async getTodayCount(@User() user: JwtUser) {
    const count = await this.devToolsService.getTodayCount(user.id);
    return { count };
  }

  // Admin only: get frequent DevTools users
  @Get('frequent-users')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Get users with frequent DevTools usage (ADMIN)' })
  async getFrequentUsers(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.devToolsService.getFrequentUsers(page, limit);
  }

  // Admin only: reset warning points for a user
  @Delete('reset/:userId')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Reset warning points for a user (ADMIN)' })
  @ApiResponse({
    status: 200,
    description: 'Warning points reset successfully',
  })
  async resetWarningPoints(@Param('userId') userId: string) {
    await this.devToolsService.resetWarningPoints(userId);
    return { success: true, message: 'Warning points reset successfully' };
  }

  // Admin only: reset all old warning points (older than 1 day)
  @Delete('reset-old')
  @Roles('ADMIN')
  @ApiOperation({
    summary: 'Reset all warning points older than 1 day (ADMIN)',
  })
  @ApiResponse({ status: 200, description: 'Old warning points reset' })
  async resetOldWarningPoints() {
    const count = await this.devToolsService.resetOldWarningPoints();
    return { success: true, message: `${count} old logs deleted` };
  }
}
