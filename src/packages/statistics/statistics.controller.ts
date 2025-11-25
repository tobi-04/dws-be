import {
  Controller,
  Get,
  Post,
  Query,
  Body,
  UseGuards,
  ParseIntPipe,
  DefaultValuePipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { StatisticsService } from './statistics.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { User } from '../../common/decorators/user.decorator';
import type { JwtUser } from '../../common/interfaces/jwt-user.interface';

@ApiTags('statistics')
@Controller('statistics')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('JWT-auth')
export class StatisticsController {
  constructor(private readonly statisticsService: StatisticsService) {}

  @Get('overview')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Get overview statistics (Admin only)' })
  @ApiResponse({ status: 200, description: 'Overview statistics' })
  async getOverviewStats() {
    return this.statisticsService.getOverviewStats();
  }

  @Get('charts')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Get chart data for statistics (Admin only)' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'days', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Chart data' })
  async getChartData(
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
    @Query('days', new DefaultValuePipe(30), ParseIntPipe) days: number,
  ) {
    return this.statisticsService.getChartData(limit, days);
  }

  @Get('top')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Get all top products stats (Admin only)' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Top products by all categories' })
  async getTopProducts(
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
  ) {
    const [topViews, topReactions, topSaves, topReviews] = await Promise.all([
      this.statisticsService.getTopViewedProducts(limit),
      this.statisticsService.getTopReactedProducts(limit),
      this.statisticsService.getTopSavedProducts(limit),
      this.statisticsService.getTopCommentedProducts(limit),
    ]);

    return { topViews, topReactions, topSaves, topReviews };
  }

  @Get('top-viewed')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Get top viewed products (Admin only)' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Top viewed products' })
  async getTopViewedProducts(
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
  ) {
    return this.statisticsService.getTopViewedProducts(limit);
  }

  @Get('top-reacted')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Get top reacted products (Admin only)' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Top reacted products' })
  async getTopReactedProducts(
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
  ) {
    return this.statisticsService.getTopReactedProducts(limit);
  }

  @Get('top-saved')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Get top saved products (Admin only)' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Top saved products' })
  async getTopSavedProducts(
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
  ) {
    return this.statisticsService.getTopSavedProducts(limit);
  }

  @Get('top-commented')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Get top commented products (Admin only)' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Top commented products' })
  async getTopCommentedProducts(
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
  ) {
    return this.statisticsService.getTopCommentedProducts(limit);
  }

  @Post('view')
  @ApiOperation({ summary: 'Record a product view' })
  @ApiResponse({ status: 201, description: 'View recorded' })
  async recordView(
    @Body() body: { productId: string; sessionId: string },
    @User() user: JwtUser,
  ) {
    await this.statisticsService.recordView(
      body.productId,
      body.sessionId,
      user.id,
    );
    return { success: true };
  }
}
