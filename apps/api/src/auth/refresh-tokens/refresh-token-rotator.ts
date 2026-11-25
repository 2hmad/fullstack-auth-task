import { Inject, Injectable } from '@nestjs/common';
import { hashToken, TokenService, type TokenPair } from '../token.service.js';
import { MongoRefreshTokenStore } from './mongo-refresh-token.store.js';

export const REFRESH_TOKEN_ROTATOR_OPTIONS = Symbol('REFRESH_TOKEN_ROTATOR_OPTIONS');

export interface RefreshTokenRotatorOptions {
  /** How long a spent token may be presented again and get the same answer. 0 turns this off. */
  reuseGraceSeconds: number;
}

/**
 * Rotates refresh tokens, and lets a client whose response was lost (timeout, dropped connection)
 * ask again instead of being mistaken for a thief.
 *
 * Within the grace period a spent token gets the pair its rotation produced, never another one, and
 * only while nobody has used that pair and the session is alive. Reuse detection is therefore
 * delayed, not lost: a thief and the owner end up holding one token, and whoever uses it second is
 * caught. Pairs are kept in this process only, so another instance, or a restart, answers strictly.
 */
@Injectable()
export class RefreshTokenRotator {
  private readonly rotations = new Map<string, Promise<TokenPair>>();

  constructor(
    private readonly tokens: TokenService,
    private readonly store: MongoRefreshTokenStore,
    @Inject(REFRESH_TOKEN_ROTATOR_OPTIONS) private readonly options: RefreshTokenRotatorOptions,
  ) {}

  async rotate(refreshToken: string): Promise<TokenPair> {
    if (this.options.reuseGraceSeconds === 0) return this.tokens.refresh(refreshToken);

    const id = hashToken(refreshToken);
    const earlier = this.rotations.get(id);
    if (!earlier) return this.startRotation(id, refreshToken);

    const pair = await earlier;
    // Otherwise TokenService's reuse detection decides, and revokes the session.
    return (await this.isUnused(pair)) ? pair : this.tokens.refresh(refreshToken);
  }

  private startRotation(id: string, refreshToken: string): Promise<TokenPair> {
    const rotation = this.tokens.refresh(refreshToken);
    this.rotations.set(id, rotation);
    const forget = () => this.rotations.delete(id);
    rotation.then(
      () => setTimeout(forget, this.options.reuseGraceSeconds * 1000).unref(),
      // Nothing was rotated: the next attempt starts again.
      forget,
    );
    return rotation;
  }

  private async isUnused({ refreshToken }: TokenPair): Promise<boolean> {
    const record = await this.store.getRefreshToken(hashToken(refreshToken));
    if (!record || record.usedAt) return false;
    return !(await this.store.isRefreshTokenFamilyRevoked(record.familyId));
  }
}
