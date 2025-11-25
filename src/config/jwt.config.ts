import { JwtModuleOptions } from '@nestjs/jwt';

/**
 * JWT configuration options
 * Uses environment variables for secret and expiration
 */
export const jwtConfig = {
  secret: process.env.JWT_SECRET || 'your-secret-key-change-this-in-production',
  signOptions: {
    expiresIn: process.env.JWT_EXPIRES_IN || '24h',
  },
  global: true, // Make JWT module global
};

/**
 * JWT constants for use across the application
 */
export const JWT_CONSTANTS = {
  secret: process.env.JWT_SECRET || 'your-secret-key-change-this-in-production',
  expiresIn: process.env.JWT_EXPIRES_IN || '24h',
  refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
};
