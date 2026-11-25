import { emailSchema } from '@auth-app/shared';
import { Module, type ExecutionContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD, Reflector } from '@nestjs/core';
import { getModelToken, MongooseModule } from '@nestjs/mongoose';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import type { Request } from 'express';
import type { Model } from 'mongoose';
import type { AppConfig } from '../config/config.types.js';
import type { User } from '../users/user.model.js';
import { CREDENTIALS_THROTTLE } from './credentials-throttle.decorator.js';
import { MongoThrottlerStorage } from './mongo-throttler.storage.js';
import { RateLimitEntity, RateLimitSchema } from './rate-limit.schema.js';

const ONE_MINUTE_MS = 60_000;
const FIFTEEN_MINUTES_MS = 15 * ONE_MINUTE_MS;

/**
 * The email of a sign-in/sign-up body, normalised by the schema that validates the request, so
 * every spelling that could reach a credential check counts against the same account. Anything
 * the schema rejects is answered with 400 before any password is checked.
 */
function submittedEmail(context: ExecutionContext): string | null {
  const body: unknown = context.switchToHttp().getRequest<Request>().body;
  const email =
    body && typeof body === 'object' ? (body as Record<string, unknown>).email : undefined;
  return emailSchema.safeParse(email).data ?? null;
}

/**
 * Three budgets:
 * - default: every route, per user when signed in, per IP otherwise;
 * - credentials: routes marked @CredentialsThrottle(), per IP (password guessing from one host);
 * - account: the same routes, per submitted email (guessing one account from many hosts).
 *   Trade-off: someone can exhaust another person's budget for 15 minutes. The limit is
 *   generous enough that a real user rarely notices, and it stops distributed guessing.
 *
 * The last two are shared between API instances (MongoThrottlerStorage).
 *
 * Imported after AuthModule: global guards run in module order, so the
 * authenticated user is known when the tracker runs.
 */
@Module({
  imports: [
    ThrottlerModule.forRootAsync({
      imports: [
        MongooseModule.forFeature([{ name: RateLimitEntity.name, schema: RateLimitSchema }]),
      ],
      inject: [ConfigService, Reflector, getModelToken(RateLimitEntity.name)],
      useFactory: (config: AppConfig, reflector: Reflector, model: Model<RateLimitEntity>) => {
        const isCredentialsRoute = (context: ExecutionContext) =>
          reflector.get<boolean | undefined>(CREDENTIALS_THROTTLE, context.getHandler()) === true;

        return {
          storage: new MongoThrottlerStorage(model),
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
              skipIf: (context) => !isCredentialsRoute(context),
            },
            {
              name: 'account',
              ttl: FIFTEEN_MINUTES_MS,
              limit: config.get('ACCOUNT_THROTTLE_LIMIT', { infer: true }),
              skipIf: (context) => !isCredentialsRoute(context) || !submittedEmail(context),
              getTracker: (_req, context) => `account:${submittedEmail(context)}`,
            },
          ],
          getTracker: (req) => {
            const { user, ip } = req as Request & { user?: User | null };
            return user ? `user:${user.id}` : `ip:${ip}`;
          },
        };
      },
    }),
  ],
  providers: [
    ThrottlerGuard,
    // useExisting (not useClass) so tests can override the guard.
    { provide: APP_GUARD, useExisting: ThrottlerGuard },
  ],
})
export class RateLimitModule {}
