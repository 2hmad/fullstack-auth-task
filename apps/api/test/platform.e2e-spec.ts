import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { closeTestApp, cookieValue, createTestApp } from './utils/app.js';

describe('Platform (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    // Trust one proxy hop so each test can pose as its own client IP via X-Forwarded-For.
    app = await createTestApp({
      AUTH_THROTTLE_LIMIT: '2',
      ACCOUNT_THROTTLE_LIMIT: '3',
      THROTTLE_LIMIT: '30',
      COOKIE_SECURE: 'true',
      TRUST_PROXY_HOPS: '1',
      REFRESH_TOKEN_REUSE_GRACE_SECONDS: '0',
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

  it('forbids storing any response, tokens and errors included', async () => {
    const signUp = await http()
      .post('/api/v1/auth/signup')
      .set('X-Forwarded-For', '203.0.113.60')
      .send({ email: 'no-store@example.com', name: 'Ada Lovelace', password: 'Analytical1!' })
      .expect(201);
    expect(signUp.headers['cache-control']).toBe('no-store');
    const denied = await http().get('/api/v1/users/me').expect(401);
    expect(denied.headers['cache-control']).toBe('no-store');
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

  it('limits every other route per client too', async () => {
    const attempt = () =>
      http().post('/api/v1/auth/refresh').set('X-Forwarded-For', '203.0.113.99');
    for (let count = 0; count < 30; count += 1) await attempt().expect(401);
    await attempt().expect(429);
    await http().post('/api/v1/auth/refresh').set('X-Forwarded-For', '203.0.113.98').expect(401);
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

  it('shares the account limit with other instances of the API', async () => {
    const otherInstance = await createTestApp();
    try {
      const attemptOn = (instance: INestApplication, ip: string) =>
        request(instance.getHttpServer())
          .post('/api/v1/auth/signin')
          .set('X-Forwarded-For', ip)
          .send({ email: 'shared-limit@example.com', password: 'guess-1!' });
      await attemptOn(app, '198.51.100.11').expect(401);
      await attemptOn(otherInstance, '198.51.100.12').expect(401);
      await attemptOn(app, '198.51.100.13').expect(401);
      await attemptOn(otherInstance, '198.51.100.14').expect(429);
    } finally {
      await otherInstance.close();
    }
  });

  it('makes refresh tokens strictly single use when the grace period is 0', async () => {
    const signUp = await http()
      .post('/api/v1/auth/signup')
      .set('X-Forwarded-For', '203.0.113.50')
      .send({ email: 'strict@example.com', name: 'Ada Lovelace', password: 'Analytical1!' })
      .expect(201);
    expect(signUp.headers['set-cookie']?.[0]).toMatch(/;\s*Secure/i);
    const spent = cookieValue(signUp.headers['set-cookie'], 'refresh_token')!;
    const refresh = (cookie: string) => http().post('/api/v1/auth/refresh').set('Cookie', cookie);

    const rotated = await refresh(spent).expect(200);
    await refresh(spent).expect(401);
    await refresh(cookieValue(rotated.headers['set-cookie'], 'refresh_token')!).expect(401);
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
    const signUpBody =
      res.body.paths['/api/v1/auth/signup'].post.requestBody.content['application/json'].schema;
    const name = signUpBody.$ref?.split('/').at(-1);
    const schema = name ? res.body.components.schemas[name] : signUpBody;
    expect(schema.required).toEqual(expect.arrayContaining(['email', 'name', 'password']));
    expect(schema.properties.email).toMatchObject({ format: 'email' });
    expect(schema.properties.name).toMatchObject({ minLength: 3 });
    expect(schema.properties.password).toMatchObject({ minLength: 8 });
  });
});
