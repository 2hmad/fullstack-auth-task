import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from 'node:crypto';

export interface ScryptCost {
  /** log2 of N, the CPU and memory cost. */
  logN: number;
  r: number;
  p: number;
}

/** OWASP's recommended minimum for scrypt is N=2^17, r=8, p=1: about 128 MiB per hash. */
const DEFAULT_COST: ScryptCost = { logN: 17, r: 8, p: 1 };
const SALT_BYTES = 16;
const KEY_BYTES = 32;
/** Bounds hashing work per request; the API's own schemas allow at most 128 characters. */
const MAX_PASSWORD_BYTES = 1024;

// $scrypt$ln=17,r=8,p=1$<salt>$<hash>, unpadded base64, as in the PHC string format.
const FORMAT =
  /^\$scrypt\$ln=(\d{1,2}),r=(\d{1,2}),p=(\d{1,2})\$([A-Za-z0-9+/]+)\$([A-Za-z0-9+/]+)$/;

const isSane = ({ logN, r, p }: ScryptCost) =>
  logN >= 10 && logN <= 20 && r >= 1 && r <= 16 && p >= 1 && p <= 4;

function derive(password: Buffer, salt: Buffer, { logN, r, p }: ScryptCost): Promise<Buffer> {
  const N = 2 ** logN;
  // scrypt needs about 128·N·r bytes; Node refuses anything over 32 MiB unless told.
  const options: ScryptOptions = { N, r, p, maxmem: 256 * N * r };
  return new Promise((resolve, reject) =>
    scrypt(password, salt, KEY_BYTES, options, (error, key) =>
      error ? reject(error) : resolve(key),
    ),
  );
}

function encode(password: string): Buffer | null {
  // Checked before normalising, which can make a string longer.
  if (password.length > MAX_PASSWORD_BYTES) return null;
  const bytes = Buffer.from(password.normalize('NFKC'), 'utf8');
  return bytes.length > 0 && bytes.length <= MAX_PASSWORD_BYTES ? bytes : null;
}

function parse(encoded: string): { cost: ScryptCost; salt: Buffer; hash: Buffer } | null {
  const match = FORMAT.exec(encoded);
  if (!match) return null;
  const cost = { logN: Number(match[1]), r: Number(match[2]), p: Number(match[3]) };
  const salt = Buffer.from(match[4]!, 'base64');
  const hash = Buffer.from(match[5]!, 'base64');
  if (!isSane(cost) || salt.length < SALT_BYTES || hash.length !== KEY_BYTES) return null;
  return { cost, salt, hash };
}

/** scrypt password hashing (Node's built-in implementation: no native addon to compile). */
export class PasswordHasher {
  private readonly cost: ScryptCost;
  private dummy?: Promise<string>;

  constructor(cost: Partial<ScryptCost> = {}) {
    this.cost = { ...DEFAULT_COST, ...cost };
    if (!isSane(this.cost)) throw new RangeError('PasswordHasher: unsupported scrypt cost');
  }

  async hash(password: string): Promise<string> {
    const input = encode(password);
    if (!input) throw new RangeError('PasswordHasher: empty or too long password');
    const salt = randomBytes(SALT_BYTES);
    const key = await derive(input, salt, this.cost);
    const b64 = (buffer: Buffer) => buffer.toString('base64').replace(/=+$/, '');
    const { logN, r, p } = this.cost;
    return `$scrypt$ln=${logN},r=${r},p=${p}$${b64(salt)}$${b64(key)}`;
  }

  /**
   * Whether the password matches the hash. Without a usable hash (unknown email) it checks
   * against a dummy one, so the answer takes as long as for a real account and timing does
   * not reveal which emails are registered.
   */
  async verify(password: string, encoded: string | undefined): Promise<boolean> {
    const parsed = encoded ? parse(encoded) : null;
    const input = encode(password) ?? Buffer.from('x');
    if (!parsed) {
      const dummy = parse(await this.dummyHash())!;
      await derive(input, dummy.salt, dummy.cost);
      return false;
    }
    const key = await derive(input, parsed.salt, parsed.cost);
    return timingSafeEqual(key, parsed.hash) && encode(password) !== null;
  }

  /** True for a hash made at another cost, to be replaced at the next successful sign-in. */
  needsRehash(encoded: string): boolean {
    const parsed = parse(encoded);
    if (!parsed) return true;
    const { logN, r, p } = parsed.cost;
    return logN !== this.cost.logN || r !== this.cost.r || p !== this.cost.p;
  }

  private dummyHash(): Promise<string> {
    this.dummy ??= this.hash('dummy password for timing equalisation').catch((error: unknown) => {
      this.dummy = undefined; // not cached: the next unknown email tries again
      throw error;
    });
    return this.dummy;
  }
}
