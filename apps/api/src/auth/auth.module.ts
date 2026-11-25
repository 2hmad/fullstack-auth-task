import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { MongooseModule } from '@nestjs/mongoose';
import type { AppConfig } from '../config/config.types.js';
import { UsersModule } from '../users/users.module.js';
import { AuthController, REFRESH_COOKIE_SETTINGS } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { AuthGuard } from './auth.guard.js';
import { PasswordHasher } from './password-hasher.js';
import { TOKEN_OPTIONS, TokenService, type TokenOptions } from './token.service.js';
import type { RefreshCookieSettings } from './refresh-token.cookie.js';
import {
  MongoRefreshTokenStore,
  REFRESH_TOKEN_STORE_OPTIONS,
  type RefreshTokenStoreOptions,
} from './refresh-tokens/mongo-refresh-token.store.js';
import {
  REFRESH_TOKEN_ROTATOR_OPTIONS,
  RefreshTokenRotator,
  type RefreshTokenRotatorOptions,
} from './refresh-tokens/refresh-token-rotator.js';
import {
  RefreshTokenEntity,
  RefreshTokenSchema,
  RevokedRefreshTokenFamilyEntity,
  RevokedRefreshTokenFamilySchema,
} from './refresh-tokens/refresh-token.schema.js';

export const JWT_ISSUER = 'auth-app-api';
export const JWT_AUDIENCE = 'auth-app-web';

@Module({
  imports: [
    UsersModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: AppConfig) => ({
        secret: config.get('JWT_SECRET', { infer: true }),
        // One algorithm, issuer and audience, enforced on verification: no `none`, no key confusion.
        signOptions: {
          algorithm: 'HS256',
          expiresIn: config.get('ACCESS_TOKEN_TTL_SECONDS', { infer: true }),
          issuer: JWT_ISSUER,
          audience: JWT_AUDIENCE,
        },
        verifyOptions: { algorithms: ['HS256'], issuer: JWT_ISSUER, audience: JWT_AUDIENCE },
      }),
    }),
    MongooseModule.forFeature([
      { name: RefreshTokenEntity.name, schema: RefreshTokenSchema },
      { name: RevokedRefreshTokenFamilyEntity.name, schema: RevokedRefreshTokenFamilySchema },
    ]),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    PasswordHasher,
    TokenService,
    { provide: APP_GUARD, useClass: AuthGuard },
    {
      provide: TOKEN_OPTIONS,
      inject: [ConfigService],
      useFactory: (config: AppConfig): TokenOptions => ({
        accessTokenTtlSeconds: config.get('ACCESS_TOKEN_TTL_SECONDS', { infer: true }),
        refreshTokenTtlSeconds: config.get('REFRESH_TOKEN_TTL_SECONDS', { infer: true }),
        refreshTokenAbsoluteTtlSeconds: config.get('REFRESH_TOKEN_ABSOLUTE_TTL_SECONDS', {
          infer: true,
        }),
      }),
    },
    MongoRefreshTokenStore,
    RefreshTokenRotator,
    {
      provide: REFRESH_TOKEN_ROTATOR_OPTIONS,
      inject: [ConfigService],
      useFactory: (config: AppConfig): RefreshTokenRotatorOptions => ({
        reuseGraceSeconds: config.get('REFRESH_TOKEN_REUSE_GRACE_SECONDS', { infer: true }),
      }),
    },
    {
      provide: REFRESH_TOKEN_STORE_OPTIONS,
      inject: [ConfigService],
      useFactory: (config: AppConfig): RefreshTokenStoreOptions => ({
        absoluteTtlSeconds: config.get('REFRESH_TOKEN_ABSOLUTE_TTL_SECONDS', { infer: true }),
      }),
    },
    {
      provide: REFRESH_COOKIE_SETTINGS,
      inject: [ConfigService],
      useFactory: (config: AppConfig): RefreshCookieSettings => ({
        secure: config.get('COOKIE_SECURE', { infer: true }),
        maxAgeSeconds: config.get('REFRESH_TOKEN_TTL_SECONDS', { infer: true }),
      }),
    },
  ],
})
export class AuthModule {}
