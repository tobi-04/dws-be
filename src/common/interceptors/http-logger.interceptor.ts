import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Request } from 'express';

@Injectable()
export class HttpLoggerInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest<Request>();
    const { method, url, body, user } = request;
    const userAgent = request.get('user-agent') || '';
    const ip = request.ip;

    const now = Date.now();
    const timestamp = new Date().toISOString();

    // Log request
    const userInfo =
      (user as any)?.username || (user as any)?.email || 'Anonymous';

    this.logger.log(
      `→ ${method} ${url} | User: ${userInfo} | IP: ${ip} | Time: ${timestamp}`,
    );

    // Log body for non-GET requests (exclude sensitive data)
    if (method !== 'GET' && body && Object.keys(body).length > 0) {
      const sanitizedBody = this.sanitizeBody(body);
      this.logger.debug(`Request Body: ${JSON.stringify(sanitizedBody)}`);
    }

    return next.handle().pipe(
      tap({
        next: (response) => {
          const duration = Date.now() - now;
          this.logger.log(
            `← ${method} ${url} | User: ${userInfo} | Status: 200 | Duration: ${duration}ms`,
          );
        },
        error: (error) => {
          const duration = Date.now() - now;
          const status = error.status || 500;
          this.logger.error(
            `← ${method} ${url} | User: ${userInfo} | Status: ${status} | Duration: ${duration}ms | Error: ${error.message}`,
          );
        },
      }),
    );
  }

  private sanitizeBody(body: any): any {
    const sanitized = { ...body };

    // Remove sensitive fields
    const sensitiveFields = [
      'password',
      'token',
      'accessToken',
      'refreshToken',
    ];
    sensitiveFields.forEach((field) => {
      if (sanitized[field]) {
        sanitized[field] = '***REDACTED***';
      }
    });

    return sanitized;
  }
}
