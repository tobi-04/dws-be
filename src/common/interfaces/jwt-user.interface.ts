import { Role } from '@prisma/client';

export interface JwtUser {
  id: string;
  username: string;
  role: Role;
}
