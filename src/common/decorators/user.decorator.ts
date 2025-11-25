import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/**
 * User decorator to extract user from request
 * @example @User() user: { id: string, username: string, role: Role }
 */
export const User = createParamDecorator(
  (data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);
