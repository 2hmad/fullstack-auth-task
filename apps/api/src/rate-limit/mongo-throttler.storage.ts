import { ThrottlerStorageService, type ThrottlerStorage } from '@nestjs/throttler';
import type { Model } from 'mongoose';
import type { RateLimitEntity } from './rate-limit.schema.js';

type ThrottlerStorageRecord = Awaited<ReturnType<ThrottlerStorage['increment']>>;

/** The name @nestjs/throttler gives the limit that applies to every route. */
const GENERAL_LIMIT = 'default';

const secondsUntil = (time: Date, now: Date) =>
  Math.max(0, Math.ceil((time.getTime() - now.getTime()) / 1000));

/**
 * Keeps the limits that slow password guessing in MongoDB, so running several instances of the API
 * (or restarting it) does not multiply anyone's budget. The general per-route limit only protects
 * an instance from load: it stays in memory, and costs no database write per request.
 *
 * If MongoDB is down the request fails. Sign-in cannot work then anyway, and nothing is let through.
 */
export class MongoThrottlerStorage implements ThrottlerStorage {
  private readonly memory = new ThrottlerStorageService();

  constructor(private readonly model: Model<RateLimitEntity>) {}

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    if (throttlerName === GENERAL_LIMIT) {
      return this.memory.increment(key, ttl, limit, blockDuration, throttlerName);
    }

    const { hits, blockedUntil, updatedAt } = await this.addHit(
      `${throttlerName}:${key}`,
      ttl,
      limit,
      blockDuration,
    );
    const oldestHit = hits[0] ?? updatedAt;
    return {
      totalHits: hits.length,
      timeToExpire: secondsUntil(new Date(oldestHit.getTime() + ttl), updatedAt),
      isBlocked: Boolean(blockedUntil),
      timeToBlockExpire: blockedUntil ? secondsUntil(blockedUntil, updatedAt) : 0,
    };
  }

  /** One atomic update on the database's clock, so concurrent requests cannot share a slot. */
  private async addHit(
    id: string,
    ttl: number,
    limit: number,
    blockDuration: number,
  ): Promise<RateLimitEntity> {
    const doc = await this.model
      .findOneAndUpdate(
        { _id: id },
        [
          {
            $set: {
              updatedAt: '$$NOW',
              blockedUntil: {
                $cond: [{ $gt: ['$blockedUntil', '$$NOW'] }, '$blockedUntil', null],
              },
              hits: {
                $filter: {
                  input: { $ifNull: ['$hits', []] },
                  cond: { $gt: ['$$this', { $subtract: ['$$NOW', ttl] }] },
                },
              },
            },
          },
          {
            $set: {
              hits: {
                $cond: ['$blockedUntil', '$hits', { $concatArrays: ['$hits', ['$$NOW']] }],
              },
            },
          },
          {
            $set: {
              blockedUntil: {
                $cond: [
                  { $and: [{ $not: ['$blockedUntil'] }, { $gt: [{ $size: '$hits' }, limit] }] },
                  { $add: ['$$NOW', blockDuration] },
                  '$blockedUntil',
                ],
              },
            },
          },
          { $set: { expiresAt: { $max: ['$blockedUntil', { $add: ['$$NOW', ttl] }] } } },
        ],
        { upsert: true, returnDocument: 'after', updatePipeline: true },
      )
      .lean<RateLimitEntity>()
      .exec();
    if (!doc) throw new Error('rate limit update returned no document');
    return doc;
  }
}
