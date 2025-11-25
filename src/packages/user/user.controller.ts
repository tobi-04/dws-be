import {
  Controller,
  Get,
  Patch,
  Delete,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { UserService } from './user.service';
import type { UserResponseDto, PaginatedUsersDto } from './dto';
import { SearchUserDto, GetUsersQueryDto } from './dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';

@ApiTags('users')
@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth('JWT-auth')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get()
  @Roles('ADMIN')
  @ApiOperation({
    summary: 'List users with pagination (ADMIN only, cached 30min)',
  })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 30 })
  @ApiQuery({
    name: 'status',
    required: false,
    type: String,
    enum: ['NORMAL', 'BANNED'],
  })
  @ApiResponse({
    status: 200,
    description: 'Users list retrieved',
    type: Promise<PaginatedUsersDto>,
  })
  async findAll(
    @Query()
    query: GetUsersQueryDto & { search?: string; status?: 'NORMAL' | 'BANNED' },
  ): Promise<PaginatedUsersDto> {
    return this.userService.findAll(
      query.page,
      query.limit,
      query.search,
      query.status,
    );
  }

  @Patch(':id/lock')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Lock user (ADMIN only)' })
  @ApiResponse({
    status: 200,
    description: 'User locked',
    type: Promise<UserResponseDto>,
  })
  async lockUser(@Param('id') id: string): Promise<UserResponseDto> {
    return this.userService.lockUser(id);
  }

  @Patch(':id/unlock')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Unlock user (ADMIN only)' })
  @ApiResponse({
    status: 200,
    description: 'User unlocked',
    type: Promise<UserResponseDto>,
  })
  async unlockUser(@Param('id') id: string): Promise<UserResponseDto> {
    return this.userService.unlockUser(id);
  }

  @Get('search')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Search users by username (ADMIN only)' })
  @ApiQuery({ name: 'username', required: true, type: String })
  @ApiResponse({
    status: 200,
    description: 'Search results',
    type: [Promise<UserResponseDto>],
  })
  async search(@Query() query: SearchUserDto): Promise<UserResponseDto[]> {
    return this.userService.search(query.username);
  }
}
