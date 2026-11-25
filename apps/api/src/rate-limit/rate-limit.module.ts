import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD, Reflector } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import type { Request } from 'express';
import type { AppConfig } from '../config/config.types.js';
import type { User } from '../users/user.model.js';
import { CREDENTIALS_THROTTLE } from './credentials-throttle.decorator.js';

const ONE_MINUTE_MS = 60_000;

/**
 * Two budgets per minute: a general one for every route (per user when signed in, per IP
 * otherwise) and a strict per-IP one for routes marked @CredentialsThrottle().
 *
 * Imported after AuthenticationModule: global guards run in module order, so the
 * authenticated user is known when the tracker runs.
 */
@Module({
  imports: [
    ThrottlerModule.forRootAsync({
      inject: [ConfigService, Reflector],
      useFactory: (config: AppConfig, reflector: Reflector) => ({
        throttlers: [
          {
            name: 'default',
            ttl: ONE_MINUTE_MS,
            limit: config.get('THROTTLE_LIMIT', { infer: true }),
          },
          {
            name: 'credentials',
            ttl: ONE_MINUTE_MS,
            limit: config.get('AUTH_THROTTLE_LIMIT', { infer: true }),
            skipIf: (context) =>
              !reflector.get<boolean>(CREDENTIALS_THROTTLE, context.getHandler()),
          },
        ],
        getTracker: (req) => {
          const { user, ip } = req as Request & { user?: User | null };
          return user ? `user:${user.id}` : `ip:${ip}`;
        },
      }),
    }),
  ],
  providers: [
    ThrottlerGuard,
    // useExisting (not useClass) so tests can override the guard.
    { provide: APP_GUARD, useExisting: ThrottlerGuard },
  ],
})
export class RateLimitModule {}
