import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import type { AppConfig } from '../config/config.types.js';
import { UsersModule } from '../users/users.module.js';
import { AuthController, REFRESH_COOKIE_SETTINGS } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { JwtAuthProvider } from './jwt-auth.provider.js';
import type { RefreshCookieSettings } from './refresh-token.cookie.js';
import {
  MongoRefreshTokenStore,
  REFRESH_TOKEN_STORE_OPTIONS,
  type RefreshTokenStoreOptions,
} from './refresh-tokens/mongo-refresh-token.store.js';
import {
  RefreshTokenEntity,
  RefreshTokenSchema,
  RevokedRefreshTokenFamilyEntity,
  RevokedRefreshTokenFamilySchema,
} from './refresh-tokens/refresh-token.schema.js';

@Module({
  imports: [
    UsersModule,
    MongooseModule.forFeature([
      { name: RefreshTokenEntity.name, schema: RefreshTokenSchema },
      { name: RevokedRefreshTokenFamilyEntity.name, schema: RevokedRefreshTokenFamilySchema },
    ]),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtAuthProvider,
    MongoRefreshTokenStore,
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
