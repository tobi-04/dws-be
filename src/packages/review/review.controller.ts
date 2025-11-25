import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
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
import { ReviewService } from './review.service';
import {
  CreateReviewDto,
  UpdateReviewDto,
  ReviewResponseDto,
  PaginatedReviewsDto,
  ToggleHiddenDto,
  LikeReviewDto,
} from './dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { User } from '../../common/decorators/user.decorator';
import type { JwtUser } from '../../common/interfaces/jwt-user.interface';

@ApiTags('reviews')
@Controller('reviews')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('JWT-auth')
export class ReviewController {
  constructor(private readonly reviewService: ReviewService) {}

  @Post()
  @ApiOperation({ summary: 'Create a review or reply' })
  @ApiResponse({
    status: 201,
    description: 'Review created',
    type: ReviewResponseDto,
  })
  async create(
    @Body() dto: CreateReviewDto,
    @User() user: JwtUser,
  ): Promise<ReviewResponseDto> {
    return this.reviewService.create(dto, user.id);
  }

  @Get('product/:productId')
  @ApiOperation({ summary: 'Get reviews for a product' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'includeHidden', required: false, type: Boolean })
  @ApiResponse({
    status: 200,
    description: 'Reviews list',
    type: PaginatedReviewsDto,
  })
  async findByProduct(
    @Param('productId') productId: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
    @Query('includeHidden') includeHidden: string,
    @User() user: JwtUser,
  ): Promise<PaginatedReviewsDto> {
    const isAdmin = user.role === 'ADMIN';
    const showHidden = isAdmin && includeHidden === 'true';
    return this.reviewService.findByProduct(
      productId,
      page,
      limit,
      user.id,
      showHidden,
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a review by ID' })
  @ApiResponse({
    status: 200,
    description: 'Review details',
    type: ReviewResponseDto,
  })
  async findOne(
    @Param('id') id: string,
    @User() user: JwtUser,
  ): Promise<ReviewResponseDto> {
    return this.reviewService.findOne(id, user.id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a review' })
  @ApiResponse({
    status: 200,
    description: 'Review updated',
    type: ReviewResponseDto,
  })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateReviewDto,
    @User() user: JwtUser,
  ): Promise<ReviewResponseDto> {
    return this.reviewService.update(id, dto, user.id);
  }

  @Patch(':id/visibility')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Toggle review visibility (Admin only)' })
  @ApiResponse({
    status: 200,
    description: 'Review visibility updated',
    type: ReviewResponseDto,
  })
  async toggleHidden(
    @Param('id') id: string,
    @Body() dto: ToggleHiddenDto,
  ): Promise<ReviewResponseDto> {
    return this.reviewService.toggleHidden(id, dto.isHidden);
  }

  @Patch(':id/hide')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Hide a review (Admin only)' })
  @ApiResponse({
    status: 200,
    description: 'Review hidden',
    type: ReviewResponseDto,
  })
  async hideReview(@Param('id') id: string): Promise<ReviewResponseDto> {
    return this.reviewService.toggleHidden(id, true);
  }

  @Patch(':id/show')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Show a review (Admin only)' })
  @ApiResponse({
    status: 200,
    description: 'Review shown',
    type: ReviewResponseDto,
  })
  async showReview(@Param('id') id: string): Promise<ReviewResponseDto> {
    return this.reviewService.toggleHidden(id, false);
  }

  @Post(':id/like')
  @ApiOperation({ summary: 'Like or dislike a review' })
  @ApiResponse({
    status: 200,
    description: 'Like status updated',
  })
  async likeReview(
    @Param('id') id: string,
    @Body() dto: LikeReviewDto,
    @User() user: JwtUser,
  ): Promise<{
    likes: number;
    dislikes: number;
    userReaction: boolean | null;
  }> {
    return this.reviewService.likeReview(id, user.id, dto.isLike);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a review' })
  @ApiResponse({ status: 200, description: 'Review deleted' })
  async delete(
    @Param('id') id: string,
    @User() user: JwtUser,
  ): Promise<{ message: string }> {
    const isAdmin = user.role === 'ADMIN';
    await this.reviewService.delete(id, user.id, isAdmin);
    return { message: 'Review deleted successfully' };
  }
}
