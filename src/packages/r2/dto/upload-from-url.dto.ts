import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsUrl, IsOptional } from 'class-validator';

export class UploadFromUrlDto {
  @ApiProperty({
    description: 'URL of the image to upload',
    example: 'https://i.imgur.com/example.jpg',
  })
  @IsString()
  @IsNotEmpty()
  @IsUrl()
  url: string;

  @ApiProperty({
    description: 'Folder to upload to',
    example: 'uploads',
    required: false,
  })
  @IsString()
  @IsOptional()
  folder?: string;
}
