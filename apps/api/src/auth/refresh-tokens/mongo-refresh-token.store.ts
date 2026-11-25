import { Inject, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import {
  AuthenticationStorage,
  type RefreshTokenRecord,
  type RefreshTokenStore,
} from '@nestjs/authentication';
import type { Model } from 'mongoose';
import { RefreshTokenEntity, RevokedRefreshTokenFamilyEntity } from './refresh-token.schema.js';

export const REFRESH_TOKEN_STORE_OPTIONS = Symbol('REFRESH_TOKEN_STORE_OPTIONS');

export interface RefreshTokenStoreOptions {
  /** Longest a family can live; revocations are kept at least this long. */
  absoluteTtlSeconds: number;
}

type StoredToken = RefreshTokenEntity;

function toRecord(doc: StoredToken): RefreshTokenRecord {
  const record: RefreshTokenRecord = {
    id: doc._id,
    familyId: doc.familyId,
    userId: doc.userId,
    createdAt: doc.createdAt,
    expiresAt: doc.expiresAt,
    familyExpiresAt: doc.familyExpiresAt,
  };
  // The contract wants optional fields absent, never null.
  if (doc.usedAt) record.usedAt = doc.usedAt;
  if (doc.claims) record.claims = doc.claims;
  return record;
}

/**
 * MongoDB storage for `@nestjs/authentication` refresh tokens (rotation + reuse detection).
 * Verified against the package's `authenticationStoreContract()` suite.
 */
@Injectable()
export class MongoRefreshTokenStore implements RefreshTokenStore {
  constructor(
    @InjectModel(RefreshTokenEntity.name) private readonly tokens: Model<RefreshTokenEntity>,
    @InjectModel(RevokedRefreshTokenFamilyEntity.name)
    private readonly revokedFamilies: Model<RevokedRefreshTokenFamilyEntity>,
    @Inject(REFRESH_TOKEN_STORE_OPTIONS) private readonly options: RefreshTokenStoreOptions,
    storage: AuthenticationStorage,
  ) {
    storage.registerSource({ refreshTokens: this });
  }

  async getRefreshToken(id: string): Promise<RefreshTokenRecord | undefined> {
    const doc = await this.tokens.findById(id).lean<StoredToken>().exec();
    return doc ? toRecord(doc) : undefined;
  }

  async saveRefreshToken(record: RefreshTokenRecord): Promise<void> {
    // Expired families are removed by the TTL index on familyExpiresAt.
    await this.tokens.create({ ...record, _id: record.id });
  }

  /** One conditional write: of concurrent calls for the same token, exactly one returns true. */
  async markRefreshTokenUsed(id: string, at: Date): Promise<boolean> {
    const result = await this.tokens
      .updateOne({ _id: id, usedAt: { $exists: false } }, { $set: { usedAt: at } })
      .exec();
    return result.modifiedCount === 1;
  }

  async revokeRefreshTokenFamily(familyId: string): Promise<void> {
    await this.revokedFamilies
      .updateOne({ _id: familyId }, { $setOnInsert: this.revocation() }, { upsert: true })
      .exec();
  }

  async isRefreshTokenFamilyRevoked(familyId: string): Promise<boolean> {
    return (await this.revokedFamilies.exists({ _id: familyId }).exec()) !== null;
  }

  async revokeUserRefreshTokens(userId: string): Promise<void> {
    const familyIds = (await this.tokens.distinct('familyId', { userId }).exec()) as string[];
    if (familyIds.length === 0) return;
    await this.revokedFamilies.bulkWrite(
      familyIds.map((familyId) => ({
        updateOne: {
          filter: { _id: familyId },
          update: { $setOnInsert: this.revocation() },
          upsert: true,
        },
      })),
    );
  }

  /** Kept for the longest possible family lifetime, so it covers every token the family can still produce. */
  private revocation() {
    const now = Date.now();
    return {
      revokedAt: new Date(now),
      expiresAt: new Date(now + this.options.absoluteTtlSeconds * 1000),
    };
  }
}
