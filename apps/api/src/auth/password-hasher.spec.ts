import { vi } from 'vitest';
import { PasswordHasher } from './password-hasher.js';

describe('PasswordHasher', () => {
  // Low cost for speed; the production default is checked separately.
  const hasher = new PasswordHasher({ logN: 10 });

  it('verifies the right password and refuses a wrong one', async () => {
    const hash = await hasher.hash('Analytical1!');
    expect(hash).toMatch(/^\$scrypt\$ln=10,r=8,p=1\$[A-Za-z0-9+/]{22}\$[A-Za-z0-9+/]{43}$/);
    expect(await hasher.verify('Analytical1!', hash)).toBe(true);
    expect(await hasher.verify('Analytical1?', hash)).toBe(false);
  });

  it('compares the whole hash, not a prefix', async () => {
    const hash = await hasher.hash('Analytical1!');
    // Changes one of the last bytes of the key (the final character also holds padding bits).
    const at = hash.length - 3;
    const changed = hash.slice(0, at) + (hash[at] === 'A' ? 'B' : 'A') + hash.slice(at + 1);
    expect(await hasher.verify('Analytical1!', changed)).toBe(false);
  });

  it('salts every hash', async () => {
    expect(await hasher.hash('same')).not.toBe(await hasher.hash('same'));
  });

  it('treats canonically equivalent passwords as the same (NFKC)', async () => {
    const hash = await hasher.hash('café');
    expect(await hasher.verify('café', hash)).toBe(true);
  });

  it('runs a full hash check for a missing or unreadable hash, so timing reveals nothing', async () => {
    const work = vi.spyOn(hasher as unknown as { dummyHash: () => Promise<string> }, 'dummyHash');
    for (const stored of [undefined, '', '!disabled', '$scrypt$ln=99,r=8,p=1$x$y']) {
      expect(await hasher.verify('Analytical1!', stored)).toBe(false);
    }
    expect(work).toHaveBeenCalledTimes(4);
  });

  it('refuses empty and oversized passwords', async () => {
    await expect(hasher.hash('')).rejects.toThrow(RangeError);
    await expect(hasher.hash('a'.repeat(1025))).rejects.toThrow(RangeError);
    const hash = await hasher.hash('a'.repeat(1024));
    expect(await hasher.verify('a'.repeat(1025), hash)).toBe(false);
  });

  it('flags hashes made at another cost for an upgrade', async () => {
    expect(hasher.needsRehash(await hasher.hash('x'))).toBe(false);
    expect(hasher.needsRehash(await new PasswordHasher({ logN: 11 }).hash('x'))).toBe(true);
    expect(hasher.needsRehash('not a hash')).toBe(true);
  });

  it('defaults to the OWASP minimum cost, and refuses unsafe ones', async () => {
    expect(await new PasswordHasher().hash('x')).toMatch(/^\$scrypt\$ln=17,r=8,p=1\$/);
    expect(() => new PasswordHasher({ logN: 8 })).toThrow(RangeError);
    expect(() => new PasswordHasher({ logN: 25 })).toThrow(RangeError);
  });
});
