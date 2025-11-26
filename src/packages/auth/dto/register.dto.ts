import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, MinLength, Matches } from 'class-validator';
import { Transform } from 'class-transformer';

export class RegisterDto {
  @ApiProperty({
    description: 'Username for registration',
    example: 'newuser',
  })
  @Transform(({ value }) => value?.trim())
  @IsString()
  @IsNotEmpty()
  @Matches(/^[a-zA-Z0-9_-]+$/, {
    message:
      'Username chỉ được chứa chữ cái, số, dấu gạch ngang (-) và dấu gạch dưới (_)',
  })
  username: string;

  @ApiProperty({
    description: 'User password',
    example: 'securepassword123',
    minLength: 6,
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(6)
  password: string;
}
