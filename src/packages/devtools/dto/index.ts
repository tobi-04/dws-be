import { IsString, IsOptional } from 'class-validator';

export class LogDevToolsDto {
  @IsString()
  path: string;

  @IsOptional()
  @IsString()
  userAgent?: string;
}

export class DevToolsLogResponseDto {
  id: string;
  userId: string;
  path: string;
  userAgent: string | null;
  createdAt: Date;
}

export class DevToolsUserStatsDto {
  userId: string;
  username: string;
  count: number;
  lastDetected: Date;
}

export class PaginatedDevToolsStatsDto {
  data: DevToolsUserStatsDto[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
