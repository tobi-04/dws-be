import {
  Controller,
  Post,
  Delete,
  Get,
  Param,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  UseGuards,
  Body,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiConsumes,
  ApiBody,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { R2Service } from './r2.service';
import { UploadResponseDto, UploadFromUrlDto } from './dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';

@ApiTags('r2')
@Controller('r2')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth('JWT-auth')
export class R2Controller {
  constructor(private readonly r2Service: R2Service) {}

  @Post('upload')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Upload image file to R2 (ADMIN only, max 5MB)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'Image file (jpg, png, gif, webp)',
        },
      },
    },
  })
  @ApiResponse({
    status: 201,
    description: 'File uploaded successfully',
    type: UploadResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid file or size exceeded' })
  @ApiResponse({ status: 403, description: 'Forbidden - ADMIN role required' })
  @UseInterceptors(FileInterceptor('file'))
  async uploadFile(
    @UploadedFile() file: Express.Multer.File,
  ): Promise<UploadResponseDto> {
    if (!file) {
      throw new BadRequestException('No file provided');
    }
    return this.r2Service.uploadFile(file);
  }

  @Post('upload-from-url')
  @Roles('ADMIN')
  @ApiOperation({
    summary: 'Upload image from URL to R2 (ADMIN only, max 5MB)',
  })
  @ApiBody({ type: UploadFromUrlDto })
  @ApiResponse({
    status: 201,
    description: 'Image uploaded from URL successfully',
    type: UploadResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid URL or image' })
  @ApiResponse({ status: 403, description: 'Forbidden - ADMIN role required' })
  async uploadFromUrl(
    @Body() uploadDto: UploadFromUrlDto,
  ): Promise<UploadResponseDto> {
    return this.r2Service.uploadFromUrl(
      uploadDto.url,
      uploadDto.folder || 'uploads',
    );
  }

  @Delete(':key')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Delete file from R2 storage (ADMIN only)' })
  @ApiResponse({ status: 200, description: 'File deleted successfully' })
  @ApiResponse({ status: 400, description: 'Delete failed' })
  @ApiResponse({ status: 403, description: 'Forbidden - ADMIN role required' })
  async deleteFile(@Param('key') key: string) {
    await this.r2Service.deleteFile(key);
    return { message: 'File deleted successfully', key };
  }

  @Get('signed-url/:key')
  @ApiOperation({ summary: 'Get signed URL for private file' })
  @ApiResponse({
    status: 200,
    description: 'Signed URL generated',
    schema: {
      type: 'object',
      properties: {
        url: { type: 'string' },
        expiresIn: { type: 'number' },
      },
    },
  })
  async getSignedUrl(@Param('key') key: string) {
    const url = await this.r2Service.getSignedUrl(key);
    return { url, expiresIn: 300 };
  }

  @Get('exists/:key')
  @ApiOperation({ summary: 'Check if file exists' })
  @ApiResponse({
    status: 200,
    description: 'File existence check result',
    schema: {
      type: 'object',
      properties: {
        exists: { type: 'boolean' },
        key: { type: 'string' },
      },
    },
  })
  async checkFileExists(@Param('key') key: string) {
    const exists = await this.r2Service.fileExists(key);
    return { exists, key };
  }
}
