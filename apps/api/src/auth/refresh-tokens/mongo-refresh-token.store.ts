import { Inject, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { RefreshTokenEntity, RevokedRefreshTokenFamilyEntity } from './refresh-token.schema.js';

export const REFRESH_TOKEN_STORE_OPTIONS = Symbol('REFRESH_TOKEN_STORE_OPTIONS');

export interface RefreshTokenStoreOptions {
  /** Longest a family can live; revocations are kept at least this long. */
  absoluteTtlSeconds: number;
}

/** One refresh token. A family is one session: every token rotated from one sign-in. */
export interface RefreshTokenRecord {
  /** SHA-256 of the token; the token itself is never stored. */
  id: string;
  familyId: string;
  userId: string;
  createdAt: Date;
  expiresAt: Date;
  familyExpiresAt: Date;
  usedAt?: Date;
}

function toRecord(doc: RefreshTokenEntity): RefreshTokenRecord {
  const { _id, familyId, userId, createdAt, expiresAt, familyExpiresAt, usedAt } = doc;
  return {
    id: _id,
    familyId,
    userId,
    createdAt,
    expiresAt,
    familyExpiresAt,
    ...(usedAt && { usedAt }),
  };
}

/** MongoDB storage for refresh tokens and revoked sessions. */
@Injectable()
export class MongoRefreshTokenStore {
  constructor(
    @InjectModel(RefreshTokenEntity.name) private readonly tokens: Model<RefreshTokenEntity>,
    @InjectModel(RevokedRefreshTokenFamilyEntity.name)
    private readonly revokedFamilies: Model<RevokedRefreshTokenFamilyEntity>,
    @Inject(REFRESH_TOKEN_STORE_OPTIONS) private readonly options: RefreshTokenStoreOptions,
  ) {}

  async getRefreshToken(id: string): Promise<RefreshTokenRecord | undefined> {
    const doc = await this.tokens.findById(id).lean<RefreshTokenEntity>().exec();
    return doc ? toRecord(doc) : undefined;
  }

  async saveRefreshToken({ id, ...record }: RefreshTokenRecord): Promise<void> {
    // Expired families are removed by the TTL index on familyExpiresAt.
    await this.tokens.create({ ...record, _id: id });
  }

  /** One conditional write: of concurrent calls for the same token, exactly one returns true. */
  async markRefreshTokenUsed(id: string, at: Date): Promise<boolean> {
    const result = await this.tokens
      .updateOne({ _id: id, usedAt: { $exists: false } }, { $set: { usedAt: at } })
      .exec();
    return result.modifiedCount === 1;
  }

  /**
   * Kept apart from the tokens, and for the longest possible family lifetime, so it also covers
   * tokens of the family saved after it (a refresh that lost the race to a reuse).
   */
  async revokeRefreshTokenFamily(familyId: string): Promise<void> {
    const now = Date.now();
    await this.revokedFamilies
      .updateOne(
        { _id: familyId },
        {
          $setOnInsert: {
            revokedAt: new Date(now),
            expiresAt: new Date(now + this.options.absoluteTtlSeconds * 1000),
          },
        },
        { upsert: true },
      )
      .exec();
  }

  async isRefreshTokenFamilyRevoked(familyId: string): Promise<boolean> {
    return (await this.revokedFamilies.exists({ _id: familyId }).exec()) !== null;
  }
}
