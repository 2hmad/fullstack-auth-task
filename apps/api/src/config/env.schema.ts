import { z } from 'zod';

/** `"true"`/`"false"` from the environment; absent means "use the default". */
const booleanFlag = z.enum(['true', 'false']).transform((value) => value === 'true');

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
    MONGODB_URI: z.url({
      protocol: /^mongodb(\+srv)?$/,
      error: 'MONGODB_URI must be a mongodb:// URL',
    }),
    /** HS256 needs at least 32 bytes of key material: `openssl rand -base64 32`. */
    JWT_SECRET: z.string().refine((value) => Buffer.byteLength(value) >= 32, {
      error: 'JWT_SECRET must be at least 32 bytes (openssl rand -base64 32)',
    }),
    ACCESS_TOKEN_TTL_SECONDS: z.coerce
      .number()
      .int()
      .positive()
      .default(15 * 60),
    REFRESH_TOKEN_TTL_SECONDS: z.coerce
      .number()
      .int()
      .positive()
      .default(7 * 24 * 60 * 60),
    /** However often a session rotates, it cannot be extended past this. */
    REFRESH_TOKEN_ABSOLUTE_TTL_SECONDS: z.coerce
      .number()
      .int()
      .positive()
      .default(30 * 24 * 60 * 60),
    /** How long a retry of a refresh whose response was lost is answered again. 0: single use, no retry. */
    REFRESH_TOKEN_REUSE_GRACE_SECONDS: z.coerce.number().int().min(0).max(60).default(30),
    /** Origin of the web app, for CORS. Same-origin deployments do not need CORS at all. */
    WEB_ORIGIN: z.url().default('http://localhost:5173'),
    COOKIE_SECURE: booleanFlag.optional(),
    /** Number of reverse proxies in front of the API, so client IPs (rate limiting, logs) are right. */
    TRUST_PROXY_HOPS: z.coerce.number().int().min(0).default(0),
    THROTTLE_LIMIT: z.coerce.number().int().positive().default(100),
    /** Sign-in/sign-up attempts per IP per minute. */
    AUTH_THROTTLE_LIMIT: z.coerce.number().int().positive().default(5),
    /** Sign-in attempts per account per 15 minutes, whatever IPs they come from. */
    ACCOUNT_THROTTLE_LIMIT: z.coerce.number().int().positive().default(10),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    /** API docs at /api/docs. Defaults to on outside production. */
    SWAGGER_ENABLED: booleanFlag.optional(),
  })
  .refine((env) => env.REFRESH_TOKEN_ABSOLUTE_TTL_SECONDS >= env.REFRESH_TOKEN_TTL_SECONDS, {
    path: ['REFRESH_TOKEN_ABSOLUTE_TTL_SECONDS'],
    error: 'REFRESH_TOKEN_ABSOLUTE_TTL_SECONDS must be >= REFRESH_TOKEN_TTL_SECONDS',
  })
  .transform((env) => ({
    ...env,
    COOKIE_SECURE: env.COOKIE_SECURE ?? env.NODE_ENV === 'production',
    SWAGGER_ENABLED: env.SWAGGER_ENABLED ?? env.NODE_ENV !== 'production',
  }));

export type Env = z.output<typeof envSchema>;

/** Used by `ConfigModule.forRoot({ validate })`: the app refuses to boot on invalid configuration. */
export function validateEnv(raw: Record<string, unknown>): Env {
  const result = envSchema.safeParse(raw);
  if (!result.success) {
    const problems = result.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${problems}`);
  }
  return result.data;
}
