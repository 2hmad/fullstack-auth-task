import { JwtService } from '@nestjs/jwt';
import mongoose, { type Connection, type Model } from 'mongoose';
import { vi } from 'vitest';
import { isolatedMongoUri } from '../../test/utils/mongo.js';
import { MongoRefreshTokenStore } from './refresh-tokens/mongo-refresh-token.store.js';
import {
  RefreshTokenEntity,
  RefreshTokenSchema,
  RevokedRefreshTokenFamilyEntity,
  RevokedRefreshTokenFamilySchema,
} from './refresh-tokens/refresh-token.schema.js';
import {
  hashToken,
  RefreshTokenError,
  TokenService,
  type AccessTokenClaims,
} from './token.service.js';

describe('TokenService', () => {
  let connection: Connection;
  let store: MongoRefreshTokenStore;
  const jwt = new JwtService({ secret: 'x'.repeat(32), signOptions: { expiresIn: 900 } });
  const options = {
    accessTokenTtlSeconds: 900,
    refreshTokenTtlSeconds: 60,
    refreshTokenAbsoluteTtlSeconds: 120,
  };
  const createService = () => new TokenService(jwt, store, options);

  beforeAll(async () => {
    connection = await mongoose.createConnection(isolatedMongoUri()).asPromise();
    const tokens = connection.model(RefreshTokenEntity.name, RefreshTokenSchema);
    const revoked = connection.model(
      RevokedRefreshTokenFamilyEntity.name,
      RevokedRefreshTokenFamilySchema,
    );
    await Promise.all([tokens.init(), revoked.init()]);
    store = new MongoRefreshTokenStore(
      tokens as unknown as Model<RefreshTokenEntity>,
      revoked as unknown as Model<RevokedRefreshTokenFamilyEntity>,
      { absoluteTtlSeconds: options.refreshTokenAbsoluteTtlSeconds },
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await connection.dropDatabase();
    await connection.close();
  });

  const claimsOf = (accessToken: string) => jwt.verify<AccessTokenClaims>(accessToken);
  const reason = (promise: Promise<unknown>) =>
    promise.then(
      () => 'resolved',
      (error: unknown) => (error instanceof RefreshTokenError ? error.reason : error),
    );

  it('starts a session: an access token naming the user and the session, and a stored refresh token', async () => {
    const pair = await createService().issue('user-1');
    expect(pair.expiresIn).toBe(900);
    expect(pair.refreshToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const claims = claimsOf(pair.accessToken);
    expect(claims).toMatchObject({ sub: 'user-1', sid: expect.any(String) });

    const stored = await store.getRefreshToken(hashToken(pair.refreshToken));
    expect(stored).toMatchObject({ userId: 'user-1', familyId: claims.sid });
    expect(JSON.stringify(stored)).not.toContain(pair.refreshToken);
  });

  it('gives every sign-in its own session', async () => {
    const [a, b] = [await createService().issue('user-1'), await createService().issue('user-1')];
    expect(claimsOf(a.accessToken).sid).not.toBe(claimsOf(b.accessToken).sid);
  });

  it('rotates within the session and spends the old token', async () => {
    const tokens = createService();
    const first = await tokens.issue('user-1');
    const second = await tokens.refresh(first.refreshToken);
    expect(second.refreshToken).not.toBe(first.refreshToken);
    expect(claimsOf(second.accessToken)).toEqual(
      expect.objectContaining({ sub: 'user-1', sid: claimsOf(first.accessToken).sid }),
    );
    expect((await store.getRefreshToken(hashToken(first.refreshToken)))?.usedAt).toBeDefined();
  });

  it('treats a spent token as stolen and revokes the whole session', async () => {
    const tokens = createService();
    const first = await tokens.issue('user-1');
    const second = await tokens.refresh(first.refreshToken);

    expect(await reason(tokens.refresh(first.refreshToken))).toBe('reused');
    expect(await reason(tokens.refresh(second.refreshToken))).toBe('invalid');
    expect(await store.isRefreshTokenFamilyRevoked(claimsOf(first.accessToken).sid)).toBe(true);
  });

  it('lets only one of two concurrent refreshes of one token through', async () => {
    const tokens = createService();
    const { refreshToken } = await tokens.issue('user-1');
    const results = await Promise.all([
      reason(tokens.refresh(refreshToken)),
      reason(tokens.refresh(refreshToken)),
    ]);
    expect(results.filter((result) => result === 'resolved').length).toBeLessThanOrEqual(1);
    expect(results).toContain('reused');
  });

  it('refuses unknown and malformed tokens without revoking anything', async () => {
    const tokens = createService();
    expect(await reason(tokens.refresh('A'.repeat(43)))).toBe('invalid');
    expect(await reason(tokens.refresh('not a token'))).toBe('invalid');
    expect(await reason(tokens.refresh(''))).toBe('invalid');
  });

  it('refuses an expired token, and does not spend it', async () => {
    const tokens = createService();
    const { refreshToken } = await tokens.issue('user-1');
    vi.useFakeTimers({ now: Date.now() + 61_000, toFake: ['Date'] });
    expect(await reason(tokens.refresh(refreshToken))).toBe('expired');
    expect((await store.getRefreshToken(hashToken(refreshToken)))?.usedAt).toBeUndefined();
  });

  it('never extends a session past its absolute lifetime', async () => {
    const tokens = createService();
    let { refreshToken } = await tokens.issue('user-1');
    const start = Date.now();
    for (const elapsed of [50_000, 100_000]) {
      vi.useFakeTimers({ now: start + elapsed, toFake: ['Date'] });
      ({ refreshToken } = await tokens.refresh(refreshToken));
    }
    const stored = await store.getRefreshToken(hashToken(refreshToken));
    expect(stored!.expiresAt.getTime()).toBeLessThanOrEqual(start + 120_000 + 1000);
    vi.useFakeTimers({ now: start + 121_000, toFake: ['Date'] });
    expect(await reason(tokens.refresh(refreshToken))).toBe('expired');
  });

  it('leaves the token unspent when saving its successor fails, so a retry works', async () => {
    const tokens = createService();
    const { refreshToken } = await tokens.issue('user-1');
    vi.spyOn(store, 'saveRefreshToken').mockRejectedValueOnce(new Error('connection lost'));
    await expect(tokens.refresh(refreshToken)).rejects.toThrow('connection lost');
    await expect(tokens.refresh(refreshToken)).resolves.toBeDefined();
  });

  it('revokes the session on sign-out, and only for a known token', async () => {
    const tokens = createService();
    const pair = await tokens.issue('user-1');
    expect(await tokens.revoke('A'.repeat(43))).toBe(false);
    expect(await tokens.revoke('malformed')).toBe(false);
    expect(await tokens.revoke(pair.refreshToken)).toBe(true);
    expect(await reason(tokens.refresh(pair.refreshToken))).toBe('invalid');
  });
});
