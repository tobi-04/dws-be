import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  MinLength,
  MaxLength,
  IsOptional,
  IsBoolean,
} from 'class-validator';

export class CreateReviewDto {
  @ApiProperty({ description: 'Product ID' })
  @IsString()
  @IsNotEmpty()
  productId: string;

  @ApiProperty({ description: 'Review content (HTML from tiptap)' })
  @IsString()
  @IsNotEmpty()
  @MinLength(10, { message: 'Review must be at least 10 characters' })
  @MaxLength(5000, { message: 'Review must be at most 5000 characters' })
  content: string;

  @ApiPropertyOptional({ description: 'Parent review ID for replies' })
  @IsString()
  @IsOptional()
  parentId?: string;
}

export class UpdateReviewDto {
  @ApiPropertyOptional({ description: 'Review content (HTML from tiptap)' })
  @IsString()
  @IsNotEmpty()
  @MinLength(10, { message: 'Review must be at least 10 characters' })
  @MaxLength(5000, { message: 'Review must be at most 5000 characters' })
  content?: string;
}

export class ToggleHiddenDto {
  @ApiProperty({ description: 'Whether the review should be hidden' })
  @IsBoolean()
  isHidden: boolean;
}

export class LikeReviewDto {
  @ApiProperty({ description: 'True for like, false for dislike' })
  @IsBoolean()
  isLike: boolean;
}

export class ReviewResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  content: string;

  @ApiProperty()
  userId: string;

  @ApiProperty()
  username: string;

  @ApiProperty()
  productId: string;

  @ApiPropertyOptional()
  parentId: string | null;

  @ApiProperty()
  isHidden: boolean;

  @ApiProperty()
  likes: number;

  @ApiProperty()
  dislikes: number;

  @ApiPropertyOptional({
    description: 'Current user reaction: true=like, false=dislike, null=none',
  })
  userReaction: boolean | null;

  @ApiProperty()
  replyCount: number;

  @ApiPropertyOptional({ type: [ReviewResponseDto] })
  replies?: ReviewResponseDto[];

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}

export class PaginatedReviewsDto {
  @ApiProperty({ type: [ReviewResponseDto] })
  items: ReviewResponseDto[];

  @ApiProperty({
    example: { total: 100, page: 1, limit: 10, totalPages: 10 },
  })
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}
