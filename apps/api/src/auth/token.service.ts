import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  MongoRefreshTokenStore,
  type RefreshTokenRecord,
} from './refresh-tokens/mongo-refresh-token.store.js';

export const TOKEN_OPTIONS = Symbol('TOKEN_OPTIONS');

export interface TokenOptions {
  accessTokenTtlSeconds: number;
  refreshTokenTtlSeconds: number;
  /** However often a session rotates, it cannot be extended past this. */
  refreshTokenAbsoluteTtlSeconds: number;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

/** `sid` names the session (the refresh-token family), so revoking it ends its access tokens. */
export interface AccessTokenClaims {
  sub: string;
  sid: string;
}

export class RefreshTokenError extends UnauthorizedException {
  constructor(readonly reason: 'invalid' | 'expired' | 'reused') {
    super(reason === 'expired' ? 'Session expired' : 'Invalid refresh token');
  }
}

/** 256 random bits, base64url. */
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const newToken = () => randomBytes(32).toString('base64url');
/** Tokens are stored as their SHA-256 only: a copy of the database cannot be replayed. */
export const hashToken = (token: string) => createHash('sha256').update(token).digest('base64url');

/**
 * Access tokens (short-lived JWTs) and rotating, single-use refresh tokens with reuse detection
 * (OAuth 2.0 Security BCP §4.14.2): presenting a spent refresh token revokes the whole session.
 */
@Injectable()
export class TokenService {
  private readonly logger = new Logger(TokenService.name);

  constructor(
    private readonly jwt: JwtService,
    private readonly store: MongoRefreshTokenStore,
    @Inject(TOKEN_OPTIONS) private readonly options: TokenOptions,
  ) {}

  /** Starts a new session for the user. */
  async issue(userId: string): Promise<TokenPair> {
    const now = Date.now();
    const familyExpiresAt = new Date(now + this.options.refreshTokenAbsoluteTtlSeconds * 1000);
    return this.createPair(userId, randomUUID(), familyExpiresAt);
  }

  /** Spends a refresh token for a new pair. */
  async refresh(refreshToken: string): Promise<TokenPair> {
    if (!TOKEN_PATTERN.test(refreshToken)) throw new RefreshTokenError('invalid');
    const record = await this.store.getRefreshToken(hashToken(refreshToken));
    if (!record || (await this.store.isRefreshTokenFamilyRevoked(record.familyId))) {
      throw new RefreshTokenError('invalid');
    }
    // A spent token is a reuse even once expired; an unspent expired one is only expired.
    if (record.usedAt) throw await this.reused(record);
    const now = new Date();
    if (record.expiresAt <= now || record.familyExpiresAt <= now) {
      throw new RefreshTokenError('expired');
    }

    // The successor is saved before this token is spent: a failure in between leaves the token
    // unspent, so the client's retry is a retry, not a reuse that ends the session. If another
    // request spent it first, revoking the family revokes this successor too.
    const pair = await this.createPair(record.userId, record.familyId, record.familyExpiresAt);
    if (!(await this.store.markRefreshTokenUsed(record.id, now))) throw await this.reused(record);
    return pair;
  }

  /** Ends the session the refresh token belongs to. False when the token is unknown. */
  async revoke(refreshToken: string): Promise<boolean> {
    if (!TOKEN_PATTERN.test(refreshToken)) return false;
    const record = await this.store.getRefreshToken(hashToken(refreshToken));
    if (!record) return false;
    await this.store.revokeRefreshTokenFamily(record.familyId);
    return true;
  }

  private async reused(record: RefreshTokenRecord): Promise<RefreshTokenError> {
    await this.store.revokeRefreshTokenFamily(record.familyId);
    this.logger.warn({ userId: record.userId }, 'Refresh token reused: session revoked');
    return new RefreshTokenError('reused');
  }

  private async createPair(
    userId: string,
    familyId: string,
    familyExpiresAt: Date,
  ): Promise<TokenPair> {
    const refreshToken = newToken();
    const now = Date.now();
    await this.store.saveRefreshToken({
      id: hashToken(refreshToken),
      familyId,
      userId,
      createdAt: new Date(now),
      expiresAt: new Date(
        Math.min(now + this.options.refreshTokenTtlSeconds * 1000, familyExpiresAt.getTime()),
      ),
      familyExpiresAt,
    });
    const claims: AccessTokenClaims = { sub: userId, sid: familyId };
    return {
      accessToken: await this.jwt.signAsync(claims),
      refreshToken,
      expiresIn: this.options.accessTokenTtlSeconds,
    };
  }
}
