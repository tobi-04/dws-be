import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { setupSwagger } from './config/swagger.config';
import { appConfig } from './config/app.config';
import { HttpLoggerInterceptor } from './common/interceptors/http-logger.interceptor';
import { json, urlencoded } from 'express';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Enable validation globally
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Enable HTTP request logging
  app.useGlobalInterceptors(new HttpLoggerInterceptor());

  // Enable CORS
  app.enableCors({
    origin: '*',
    credentials: true,
  });

  // Global API prefix
  app.setGlobalPrefix('api/v1');

  app.use(json({ limit: '50mb' }));
  app.use(urlencoded({ extended: true, limit: '50mb' }));

  // Setup Swagger documentation
  setupSwagger(app);

  await app.listen(appConfig.port);
  console.log(`Application is running on: http://localhost:${appConfig.port}`);
  console.log(`Swagger documentation: http://localhost:${appConfig.port}/api`);
}
bootstrap();
