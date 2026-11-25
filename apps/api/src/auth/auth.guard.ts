import {
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import type { User } from '../users/user.model.js';
import { UsersRepository } from '../users/users.repository.js';
import { IS_PUBLIC } from './auth.decorators.js';
import { MongoRefreshTokenStore } from './refresh-tokens/mongo-refresh-token.store.js';
import type { AccessTokenClaims } from './token.service.js';

export type AuthenticatedRequest = Request & { user?: User };

const BEARER = /^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/;

/**
 * Global guard: every route needs `Authorization: Bearer <access token>` unless it is @Public(),
 * so a forgotten decorator fails closed. The signature, algorithm, issuer, audience and expiry
 * are checked by JwtService; the user and the session are then loaded on every request, so a
 * deleted account, a sign-out or a revoked session stops working at once.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly users: UsersRepository,
    private readonly sessions: MongoRefreshTokenStore,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean | undefined>(IS_PUBLIC, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = await this.authenticate(request.headers.authorization);
    if (!user) throw new UnauthorizedException('Missing, invalid or expired access token');
    request.user = user;
    return true;
  }

  private async authenticate(header: string | undefined): Promise<User | null> {
    const token = header && BEARER.exec(header)?.[1];
    if (!token) return null;

    let claims: AccessTokenClaims;
    try {
      claims = await this.jwt.verifyAsync<AccessTokenClaims>(token);
    } catch {
      return null;
    }
    if (typeof claims.sub !== 'string' || typeof claims.sid !== 'string') return null;

    const [user, revoked] = await Promise.all([
      this.users.findById(claims.sub),
      this.sessions.isRefreshTokenFamilyRevoked(claims.sid),
    ]);
    return revoked ? null : user;
  }
}
