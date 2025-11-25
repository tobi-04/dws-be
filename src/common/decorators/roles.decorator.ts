import { SetMetadata } from '@nestjs/common';
import { Role } from '@prisma/client';

export const ROLES_KEY = 'roles';

/**
 * Roles decorator to specify which roles can access a route
 * @param roles - Array of roles that can access the route
 * @example @Roles('ADMIN')
 * @example @Roles('ADMIN', 'USER')
 */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
