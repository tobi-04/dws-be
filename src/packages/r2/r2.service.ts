import { Injectable, BadRequestException } from '@nestjs/common';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { request } from 'undici';
import { r2Config } from '../../config/r2.config';
import { UploadResponseDto } from './dto';
import { v4 as uuidv4 } from 'uuid';

const ALLOWED_IMAGE_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/gif',
  'image/webp',
];
const MAX_FILE_SIZE = 5 * 1024 * 1024;

@Injectable()
export class R2Service {
  private s3Client: S3Client;
  private bucket: string;

  constructor() {
    this.s3Client = new S3Client({
      region: r2Config.region,
      endpoint: r2Config.endpoint,
      credentials: {
        accessKeyId: r2Config.accessKeyId,
        secretAccessKey: r2Config.secretAccessKey,
      },
    });
    this.bucket = r2Config.bucket;
  }

  private validateImageFile(file: Express.Multer.File): void {
    if (!ALLOWED_IMAGE_TYPES.includes(file.mimetype)) {
      throw new BadRequestException(
        `Invalid file type. Allowed: ${ALLOWED_IMAGE_TYPES.join(', ')}`,
      );
    }
    if (file.size > MAX_FILE_SIZE) {
      throw new BadRequestException(`File too large. Max size: 5MB`);
    }
  }

  private normalizeImageUrl(url: string): string {
    const googleDriveMatch = url.match(
      /drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/,
    );
    if (googleDriveMatch) {
      const fileId = googleDriveMatch[1];
      return `https://drive.google.com/uc?export=download&id=${fileId}&confirm=t`;
    }

    return url;
  }

  async uploadFile(
    file: Express.Multer.File,
    folder: string = 'uploads',
    customKey?: string,
  ): Promise<UploadResponseDto> {
    if (!file) {
      throw new BadRequestException('No file provided');
    }

    this.validateImageFile(file);

    let key = customKey;
    if (!key) {
      const fileExtension = file.originalname.split('.').pop();
      key = `${folder}/${uuidv4()}.${fileExtension}`;
    }

    const upload = new Upload({
      client: this.s3Client,
      params: {
        Bucket: this.bucket,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype,
      },
    });

    await upload.done();

    const url = r2Config.publicUrl
      ? `${r2Config.publicUrl}/${key}`
      : `${r2Config.endpoint}/${this.bucket}/${key}`;

    return {
      url,
      key,
      filename: file.originalname,
      size: file.size,
    };
  }

  async uploadFromUrl(
    imageUrl: string,
    folder: string = 'uploads',
    customKey?: string,
  ): Promise<UploadResponseDto> {
    try {
      const normalizedUrl = this.normalizeImageUrl(imageUrl);

      let currentUrl = normalizedUrl;
      let response;
      let redirectCount = 0;
      const maxRedirects = 5;

      while (redirectCount < maxRedirects) {
        response = await request(currentUrl, {
          method: 'GET',
        });

        if (
          response.statusCode >= 300 &&
          response.statusCode < 400 &&
          response.headers.location
        ) {
          currentUrl = response.headers.location as string;
          redirectCount++;
          await response.body.text();
          continue;
        }

        break;
      }

      if (redirectCount >= maxRedirects) {
        throw new BadRequestException('Link ảnh không hợp lệ');
      }

      if (response.statusCode !== 200) {
        throw new BadRequestException('Link ảnh không hợp lệ');
      }

      const contentType = response.headers['content-type'] as string;
      const contentLength = parseInt(
        response.headers['content-length'] as string,
        10,
      );

      if (!contentType || !ALLOWED_IMAGE_TYPES.includes(contentType)) {
        throw new BadRequestException('Link ảnh không hợp lệ');
      }

      if (contentLength > MAX_FILE_SIZE) {
        throw new BadRequestException('Image too large. Max size: 5MB');
      }

      let key = customKey;
      if (!key) {
        const extension = contentType.split('/')[1] || 'jpg';
        key = `${folder}/${uuidv4()}.${extension}`;
      }

      const upload = new Upload({
        client: this.s3Client,
        params: {
          Bucket: this.bucket,
          Key: key,
          Body: response.body,
          ContentType: contentType,
        },
      });

      await upload.done();

      const url = r2Config.publicUrl
        ? `${r2Config.publicUrl}/${key}`
        : `${r2Config.endpoint}/${this.bucket}/${key}`;

      return {
        url,
        key,
        filename: key.split('/').pop() || key,
        size: contentLength,
      };
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException('Link ảnh không hợp lệ');
    }
  }

  async deleteFile(key: string): Promise<boolean> {
    await this.s3Client.send(
      new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: key,
      }),
    );
    return true;
  }

  async getSignedUrl(key: string, expiresIn: number = 300): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });

    return await getSignedUrl(this.s3Client, command, { expiresIn });
  }

  async fileExists(key: string): Promise<boolean> {
    try {
      await this.s3Client.send(
        new HeadObjectCommand({
          Bucket: this.bucket,
          Key: key,
        }),
      );
      return true;
    } catch {
      return false;
    }
  }
}
