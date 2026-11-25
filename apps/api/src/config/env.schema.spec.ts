import { validateEnv } from './env.schema.js';

const base = {
  MONGODB_URI: 'mongodb://localhost:27017/auth-app',
  JWT_SECRET: 'x'.repeat(32),
};

describe('validateEnv', () => {
  it('applies defaults for everything optional', () => {
    expect(validateEnv(base)).toMatchObject({
      NODE_ENV: 'development',
      PORT: 3000,
      WEB_ORIGIN: 'http://localhost:5173',
      ACCESS_TOKEN_TTL_SECONDS: 900,
      REFRESH_TOKEN_TTL_SECONDS: 604_800,
      THROTTLE_LIMIT: 100,
      AUTH_THROTTLE_LIMIT: 5,
      LOG_LEVEL: 'info',
      COOKIE_SECURE: false,
      SWAGGER_ENABLED: true,
    });
  });

  it('coerces numeric and boolean strings', () => {
    const env = validateEnv({
      ...base,
      PORT: '8080',
      COOKIE_SECURE: 'true',
      SWAGGER_ENABLED: 'false',
    });
    expect(env.PORT).toBe(8080);
    expect(env.COOKIE_SECURE).toBe(true);
    expect(env.SWAGGER_ENABLED).toBe(false);
  });

  it('defaults to secure cookies in production', () => {
    expect(validateEnv({ ...base, NODE_ENV: 'production' }).COOKIE_SECURE).toBe(true);
  });

  it('refuses to start without a MongoDB URI', () => {
    expect(() => validateEnv({ JWT_SECRET: base.JWT_SECRET })).toThrow(/MONGODB_URI/);
  });

  it('refuses a JWT secret shorter than 32 bytes', () => {
    expect(() => validateEnv({ ...base, JWT_SECRET: 'too-short' })).toThrow(/JWT_SECRET/);
  });

  it('refuses a refresh token that outlives its own family', () => {
    expect(() =>
      validateEnv({
        ...base,
        REFRESH_TOKEN_TTL_SECONDS: '100',
        REFRESH_TOKEN_ABSOLUTE_TTL_SECONDS: '50',
      }),
    ).toThrow(/REFRESH_TOKEN_ABSOLUTE_TTL_SECONDS/);
  });
});
