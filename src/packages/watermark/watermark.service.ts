import { Injectable, Logger } from '@nestjs/common';
import sharp from 'sharp';

// Pre-computed watermark SVG cache
const watermarkSvgCache = new Map<string, string>();

@Injectable()
export class WatermarkService {
  private readonly logger = new Logger(WatermarkService.name);

  // Thumbnail settings cho list view - giảm xuống 300px
  private readonly THUMBNAIL_WIDTH = 300;
  private readonly THUMBNAIL_QUALITY = 70;

  /**
   * Thêm logo "pioneerx" nhỏ ở góc ảnh khi upload lên R2
   * Dùng để truy vết nguồn gốc ảnh
   */
  async addLogoWatermark(imageBuffer: Buffer): Promise<Buffer> {
    try {
      const metadata = await sharp(imageBuffer).metadata();
      const width = metadata.width || 800;
      const height = metadata.height || 600;

      // Tạo SVG logo nhỏ ở góc dưới phải
      const logoSvg = this.createLogoSvg(width, height);

      const watermarkedImage = await sharp(imageBuffer)
        .composite([
          {
            input: Buffer.from(logoSvg),
            top: 0,
            left: 0,
          },
        ])
        .toBuffer();

      this.logger.log('Logo watermark added');
      return watermarkedImage;
    } catch (error: unknown) {
      const err = error as Error;
      this.logger.error(
        `Failed to add logo watermark: ${err.message}`,
        err.stack,
      );
      throw error;
    }
  }

  /**
   * Thêm logo watermark cho ảnh từ URL
   */
  async addLogoWatermarkToUrl(imageUrl: string): Promise<Buffer> {
    try {
      const response = await fetch(imageUrl);
      if (!response.ok) {
        throw new Error(
          `Failed to fetch image from URL: ${response.statusText}`,
        );
      }

      const arrayBuffer = await response.arrayBuffer();
      const imageBuffer = Buffer.from(arrayBuffer);

      return this.addLogoWatermark(imageBuffer);
    } catch (error: unknown) {
      const err = error as Error;
      this.logger.error(
        `Failed to add logo watermark from URL: ${err.message}`,
        err.stack,
      );
      throw error;
    }
  }

  /**
   * Thêm watermark username
   * @param thumbnail - true: resize nhỏ cho list view, false: giữ nguyên chất lượng gốc
   */
  async addUsernameWatermark(
    imageBuffer: Buffer,
    username: string,
    thumbnail: boolean = false,
  ): Promise<Buffer> {
    try {
      let processedBuffer = imageBuffer;
      let width: number;
      let height: number;
      let format: string;

      if (thumbnail) {
        // Resize nhỏ cho list view - nhanh hơn, file nhỏ hơn
        const resized = await sharp(imageBuffer)
          .resize(this.THUMBNAIL_WIDTH, null, {
            withoutEnlargement: true,
            fit: 'inside',
          })
          .jpeg({ quality: this.THUMBNAIL_QUALITY })
          .toBuffer();

        processedBuffer = resized;
        const metadata = await sharp(resized).metadata();
        width = metadata.width || this.THUMBNAIL_WIDTH;
        height = metadata.height || 200;
        format = 'jpeg';
      } else {
        // Giữ nguyên chất lượng gốc cho detail view
        const metadata = await sharp(imageBuffer).metadata();
        width = metadata.width || 800;
        height = metadata.height || 600;
        format = metadata.format || 'jpeg';
      }

      // Sử dụng cached SVG nếu có
      const cacheKey = `${width}x${height}:${username}`;
      let watermarkSvg = watermarkSvgCache.get(cacheKey);

      if (!watermarkSvg) {
        watermarkSvg = this.createUsernameWatermarkSvg(width, height, username);
        watermarkSvgCache.set(cacheKey, watermarkSvg);

        // Giới hạn cache size
        if (watermarkSvgCache.size > 100) {
          const firstKey = watermarkSvgCache.keys().next().value as string;
          watermarkSvgCache.delete(firstKey);
        }
      }

      let sharpInstance = sharp(processedBuffer).composite([
        {
          input: Buffer.from(watermarkSvg),
          top: 0,
          left: 0,
        },
      ]);

      // Output format
      if (thumbnail) {
        sharpInstance = sharpInstance.jpeg({ quality: this.THUMBNAIL_QUALITY });
      } else if (format === 'png') {
        sharpInstance = sharpInstance.png({ quality: 100 });
      } else if (format === 'webp') {
        sharpInstance = sharpInstance.webp({ quality: 95 });
      } else {
        sharpInstance = sharpInstance.jpeg({ quality: 95 });
      }

      return sharpInstance.toBuffer();
    } catch (error: unknown) {
      const err = error as Error;
      this.logger.error(
        `Failed to add username watermark: ${err.message}`,
        err.stack,
      );
      throw error;
    }
  }

  /**
   * Lấy ảnh từ URL, thêm watermark và trả về base64
   * @param thumbnail - true: resize nhỏ cho list view, false: giữ nguyên chất lượng
   */
  async getWatermarkedImageBase64(
    imageUrl: string,
    username: string,
    thumbnail: boolean = false,
  ): Promise<string> {
    try {
      // Fetch với timeout
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(imageUrl, { signal: controller.signal });
      clearTimeout(timeout);

      if (!response.ok) {
        throw new Error(
          `Failed to fetch image from URL: ${response.statusText}`,
        );
      }

      const arrayBuffer = await response.arrayBuffer();
      const imageBuffer = Buffer.from(arrayBuffer);

      const watermarkedBuffer = await this.addUsernameWatermark(
        imageBuffer,
        username,
        thumbnail,
      );

      // Chuyển sang base64
      const base64 = watermarkedBuffer.toString('base64');
      const mimeType = thumbnail ? 'image/jpeg' : this.getMimeType(imageUrl);

      return `data:${mimeType};base64,${base64}`;
    } catch (error: unknown) {
      const err = error as Error;
      this.logger.error(
        `Failed to get watermarked image base64: ${err.message}`,
        err.stack,
      );
      throw error;
    }
  }

  /**
   * Tạo SVG logo "pioneerx" nhỏ ở góc dưới phải
   */
  private createLogoSvg(width: number, height: number): string {
    const fontSize = Math.max(12, Math.min(width, height) / 30);
    const padding = fontSize;
    const x = width - padding;
    const y = height - padding;

    return `
      <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
        <text
          x="${x}"
          y="${y}"
          fill="rgba(255,255,255,0.5)"
          font-size="${fontSize}"
          font-family="Arial, sans-serif"
          font-weight="bold"
          text-anchor="end"
          style="text-shadow: 1px 1px 2px rgba(0,0,0,0.7);"
        >pioneerx</text>
      </svg>
    `;
  }

  /**
   * Tạo SVG watermark với username xoay chéo phủ toàn bộ ảnh
   */
  private createUsernameWatermarkSvg(
    width: number,
    height: number,
    username: string,
  ): string {
    const fontSize = Math.max(16, Math.min(width, height) / 15);
    const spacing = fontSize * 4;

    const texts: string[] = [];
    const diagonal = Math.sqrt(width * width + height * height);
    const offsetX = (diagonal - width) / 2;
    const offsetY = (diagonal - height) / 2;

    for (let row = 0; row < Math.ceil(diagonal / spacing) + 4; row++) {
      for (
        let col = 0;
        col < Math.ceil(diagonal / (username.length * fontSize * 0.6)) + 4;
        col++
      ) {
        const x = col * spacing * 2 - offsetX;
        const y = row * spacing - offsetY;
        texts.push(
          `<text x="${x}" y="${y}" fill="rgba(255,255,255,0.55)" font-size="${fontSize}" font-family="Arial, sans-serif" font-weight="bold">${this.escapeXml(username)}</text>`,
        );
      }
    }

    return `
      <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <style>
            text { text-shadow: 1px 1px 2px rgba(0,0,0,0.5); }
          </style>
        </defs>
        <g transform="rotate(-30, ${width / 2}, ${height / 2})">
          ${texts.join('\n          ')}
        </g>
      </svg>
    `;
  }

  private escapeXml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  private getMimeType(url: string): string {
    const ext = url.split('.').pop()?.toLowerCase().split('?')[0] || 'jpg';
    const mimeTypes: Record<string, string> = {
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      gif: 'image/gif',
      webp: 'image/webp',
    };
    return mimeTypes[ext] || 'image/jpeg';
  }
}
