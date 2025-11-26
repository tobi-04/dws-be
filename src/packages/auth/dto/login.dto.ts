import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';

export class LoginDto {
  @ApiProperty({
    description: 'Username for login',
    example: 'testuser',
  })
  @Transform(({ value }) => value?.trim())
  @IsString()
  @IsNotEmpty()
  username: string;

  @ApiProperty({
    description: 'User password',
    example: 'password123',
    minLength: 3,
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  password: string;
}
