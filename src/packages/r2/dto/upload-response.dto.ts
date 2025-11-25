import { ApiProperty } from '@nestjs/swagger';

export class UploadResponseDto {
  @ApiProperty({
    description: 'URL of the uploaded file',
    example: 'https://your-bucket.r2.dev/uploads/filename.jpg',
  })
  url: string;

  @ApiProperty({
    description: 'Unique key/path of the file in R2',
    example: 'uploads/uuid-filename.jpg',
  })
  key: string;

  @ApiProperty({
    description: 'Original filename',
    example: 'myimage.jpg',
  })
  filename: string;

  @ApiProperty({
    description: 'File size in bytes',
    example: 1024567,
  })
  size: number;
}
