import { randomBytes } from 'node:crypto';
import { vi } from 'vitest';
import type { TokenPair, TokenService } from '../token.service.js';
import type { MongoRefreshTokenStore, RefreshTokenRecord } from './mongo-refresh-token.store.js';
import { RefreshTokenRotator } from './refresh-token-rotator.js';

const token = () => randomBytes(32).toString('base64url');
const pairFor = (refreshToken: string): TokenPair => ({
  accessToken: `access-${refreshToken}`,
  refreshToken,
  expiresIn: 900,
});

describe('RefreshTokenRotator', () => {
  const GRACE_SECONDS = 30;
  const tokens = { refresh: vi.fn() };
  const store = { getRefreshToken: vi.fn(), isRefreshTokenFamilyRevoked: vi.fn() };
  const unusedSuccessor = { familyId: 'family' } as RefreshTokenRecord;

  const createRotator = (reuseGraceSeconds = GRACE_SECONDS) =>
    new RefreshTokenRotator(
      tokens as unknown as TokenService,
      store as unknown as MongoRefreshTokenStore,
      { reuseGraceSeconds },
    );

  beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers();
    tokens.refresh.mockImplementation(() => Promise.resolve(pairFor(token())));
    store.getRefreshToken.mockResolvedValue(unusedSuccessor);
    store.isRefreshTokenFamilyRevoked.mockResolvedValue(false);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('answers a retry with the same pair, because the first response may have been lost', async () => {
    const rotator = createRotator();
    const spent = token();
    const first = await rotator.rotate(spent);
    vi.advanceTimersByTime(GRACE_SECONDS * 1000 - 1);
    expect(await rotator.rotate(spent)).toEqual(first);
    expect(tokens.refresh).toHaveBeenCalledOnce();
  });

  it('shares one rotation between concurrent requests', async () => {
    const rotator = createRotator();
    const spent = token();
    const pairs = await Promise.all([1, 2, 3].map(() => rotator.rotate(spent)));
    expect(new Set(pairs.map((pair) => pair.refreshToken)).size).toBe(1);
    expect(tokens.refresh).toHaveBeenCalledOnce();
  });

  it('treats the token as reused once the grace period is over', async () => {
    const rotator = createRotator();
    const spent = token();
    await rotator.rotate(spent);
    vi.advanceTimersByTime(GRACE_SECONDS * 1000);
    await rotator.rotate(spent);
    expect(tokens.refresh).toHaveBeenCalledTimes(2);
  });

  it('does not extend the grace period when a retry is answered', async () => {
    const rotator = createRotator();
    const spent = token();
    await rotator.rotate(spent);
    vi.advanceTimersByTime((GRACE_SECONDS * 1000) / 2);
    await rotator.rotate(spent);
    vi.advanceTimersByTime((GRACE_SECONDS * 1000) / 2);
    await rotator.rotate(spent);
    expect(tokens.refresh).toHaveBeenCalledTimes(2);
  });

  it.each([
    [
      'the successor was used',
      () => store.getRefreshToken.mockResolvedValue({ ...unusedSuccessor, usedAt: new Date() }),
    ],
    ['the successor is unknown', () => store.getRefreshToken.mockResolvedValue(undefined)],
    ['the session was revoked', () => store.isRefreshTokenFamilyRevoked.mockResolvedValue(true)],
  ])('treats the token as reused when %s', async (_case, arrange) => {
    const rotator = createRotator();
    const spent = token();
    await rotator.rotate(spent);
    arrange();
    await rotator.rotate(spent);
    expect(tokens.refresh).toHaveBeenCalledTimes(2);
    expect(tokens.refresh).toHaveBeenLastCalledWith(spent);
  });

  it('never answers one token with the pair of another', async () => {
    const rotator = createRotator();
    const [a, b] = [await rotator.rotate(token()), await rotator.rotate(token())];
    expect(a.refreshToken).not.toBe(b.refreshToken);
  });

  it('forgets a failed rotation, so a retry after an outage starts again', async () => {
    const rotator = createRotator();
    const unspent = token();
    tokens.refresh.mockRejectedValueOnce(new Error('connection lost'));
    await expect(rotator.rotate(unspent)).rejects.toThrow('connection lost');
    await expect(rotator.rotate(unspent)).resolves.toBeDefined();
    expect(tokens.refresh).toHaveBeenCalledTimes(2);
  });

  it('is strictly single use when the grace period is 0', async () => {
    const rotator = createRotator(0);
    const spent = token();
    await rotator.rotate(spent);
    await rotator.rotate(spent);
    expect(tokens.refresh).toHaveBeenCalledTimes(2);
  });
});
