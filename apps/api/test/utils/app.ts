import type { INestApplication } from '@nestjs/common';
import { getConnectionToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import type { Connection } from 'mongoose';
import { PasswordHasher } from '../../src/auth/password-hasher.js';
import { isolatedMongoUri } from './mongo.js';

export const TEST_JWT_SECRET = 'test-secret-that-is-at-least-32-bytes-long!';

/**
 * Boots the real AppModule against its own database. Env is set before AppModule is
 * imported because module options are read at import time.
 */
export async function createTestApp(env: Record<string, string> = {}): Promise<INestApplication> {
  Object.assign(process.env, {
    MONGODB_URI: isolatedMongoUri(),
    JWT_SECRET: TEST_JWT_SECRET,
    THROTTLE_LIMIT: '1000',
    AUTH_THROTTLE_LIMIT: '1000',
    ACCOUNT_THROTTLE_LIMIT: '1000',
    ...env,
  });
  const { AppModule } = await import('../../src/app.module.js');
  const { configureApp } = await import('../../src/app.setup.js');

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    // The production cost (~0.3 s per hash) only slows the suite down.
    .overrideProvider(PasswordHasher)
    .useValue(new PasswordHasher({ logN: 11 }))
    .compile();

  const app = moduleRef.createNestApplication({ bufferLogs: true });
  configureApp(app);
  await app.init();
  return app;
}

export async function closeTestApp(app: INestApplication): Promise<void> {
  await app.get<Connection>(getConnectionToken()).dropDatabase();
  await app.close();
}

/** The `name=value` part of a Set-Cookie header, ready to send back in a Cookie header. */
export function cookieValue(
  setCookie: string[] | string | undefined,
  name: string,
): string | undefined {
  const headers = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
  const cookie = headers.find((header) => header.startsWith(`${name}=`));
  return cookie?.split(';')[0];
}
