import {
  Injectable,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { PrismaService } from '../../../prisma/prisma.service';
import { Reflector } from '@nestjs/core';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const canActivate = await super.canActivate(context);
    if (!canActivate) {
      return false;
    }

    // Check if route is marked as skip-ban-check
    const skipBanCheck = this.reflector.get<boolean>(
      'skipBanCheck',
      context.getHandler(),
    );
    if (skipBanCheck) {
      return true;
    }

    // Get user from request
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (user?.id) {
      // Check if user is banned
      const dbUser = await this.prisma.user.findUnique({
        where: { id: user.id },
        select: { status: true },
      });

      if (dbUser?.status === 'BANNED') {
        throw new ForbiddenException(
          'Your account has been locked. Please contact admin.',
        );
      }
    }

    return true;
  }
}
