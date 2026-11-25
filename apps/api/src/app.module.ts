import { Module, StandardSchemaValidationPipe } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_PIPE } from '@nestjs/core';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthenticationModule } from '@nestjs/authentication';
import { AuthModule } from './auth/auth.module.js';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter.js';
import type { AppConfig } from './config/config.types.js';
import { validateEnv } from './config/env.schema.js';
import { HealthModule } from './health/health.module.js';
import { LoggingModule } from './logging/logging.module.js';
import { RateLimitModule } from './rate-limit/rate-limit.module.js';
import { UsersModule } from './users/users.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, cache: true, validate: validateEnv }),
    LoggingModule,
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: AppConfig) => ({
        uri: config.get('MONGODB_URI', { infer: true }),
        serverSelectionTimeoutMS: 5000,
      }),
    }),
    // Order matters: global guards run in import order. Authentication first, so the
    // rate limiter can count signed-in users per account instead of per IP.
    AuthenticationModule.forRootAsync({
      isGlobal: true,
      inject: [ConfigService],
      useFactory: (config: AppConfig) => ({
        accessToken: {
          key: config.get('JWT_SECRET', { infer: true }),
          ttl: config.get('ACCESS_TOKEN_TTL_SECONDS', { infer: true }) * 1000,
          issuer: 'auth-app-api',
          audience: 'auth-app-web',
        },
        refreshToken: {
          ttl: config.get('REFRESH_TOKEN_TTL_SECONDS', { infer: true }) * 1000,
          absoluteTtl: config.get('REFRESH_TOKEN_ABSOLUTE_TTL_SECONDS', { infer: true }) * 1000,
        },
      }),
    }),
    RateLimitModule,
    UsersModule,
    AuthModule,
    HealthModule,
  ],
  providers: [
    { provide: APP_PIPE, useClass: StandardSchemaValidationPipe },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
