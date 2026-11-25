import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { closeTestApp, createTestApp } from './utils/app.js';

describe('Platform (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    // Trust one proxy hop so each test can pose as its own client IP via X-Forwarded-For.
    app = await createTestApp({
      AUTH_THROTTLE_LIMIT: '2',
      ACCOUNT_THROTTLE_LIMIT: '3',
      TRUST_PROXY_HOPS: '1',
    });
  });

  afterAll(async () => {
    await closeTestApp(app);
  });

  const http = () => request(app.getHttpServer());

  it('GET /health answers without touching dependencies', async () => {
    await http().get('/health').expect(200, { status: 'ok' });
  });

  it('GET /ready checks MongoDB', async () => {
    const res = await http().get('/ready').expect(200);
    expect(res.body.info.mongodb.status).toBe('up');
  });

  it('rate-limits credential endpoints per IP', async () => {
    const attempt = () =>
      http()
        .post('/api/v1/auth/signin')
        .set('X-Forwarded-For', '203.0.113.1')
        .send({ email: 'a@example.com', password: 'whatever1!' });
    await attempt().expect(401);
    await attempt().expect(401);
    const limited = await attempt().expect(429);
    expect(limited.body).toMatchObject({ statusCode: 429, error: 'Too Many Requests' });
  });

  it('limits sign-in attempts per account, whichever IP they come from', async () => {
    const attemptFrom = (ip: string) =>
      http()
        .post('/api/v1/auth/signin')
        .set('X-Forwarded-For', ip)
        .send({ email: 'Victim@Example.com', password: 'guess-1!' });
    for (const ip of ['198.51.100.1', '198.51.100.2', '198.51.100.3']) {
      await attemptFrom(ip).expect(401);
    }
    await attemptFrom('198.51.100.4').expect(429);
  });

  it('counts differently written forms of one email against the same account', async () => {
    const attempt = (email: string, ip: string) =>
      http()
        .post('/api/v1/auth/signin')
        .set('X-Forwarded-For', ip)
        .send({ email, password: 'guess-1!' });
    // Validation trims before checking the length, so a heavily padded email is a valid one.
    await attempt('padded@example.com', '192.0.2.1').expect(401);
    await attempt(`padded@example.com${' '.repeat(300)}`, '192.0.2.2').expect(401);
    await attempt(`${' '.repeat(300)}PADDED@example.com`, '192.0.2.3').expect(401);
    await attempt(`padded@example.com${' '.repeat(301)}`, '192.0.2.4').expect(429);
  });

  it('serves the OpenAPI document generated from the shared schemas', async () => {
    const res = await http().get('/api/docs-json').expect(200);
    expect(Object.keys(res.body.paths)).toEqual(
      expect.arrayContaining([
        '/api/v1/auth/signup',
        '/api/v1/auth/signin',
        '/api/v1/auth/refresh',
        '/api/v1/auth/logout',
        '/api/v1/users/me',
      ]),
    );
  });
});
