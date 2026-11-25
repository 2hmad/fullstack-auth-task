import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { closeTestApp, createTestApp } from './utils/app.js';

describe('Platform (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    app = await createTestApp({ AUTH_THROTTLE_LIMIT: '2' });
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
      http().post('/api/v1/auth/signin').send({ email: 'a@example.com', password: 'whatever1!' });
    await attempt().expect(401);
    await attempt().expect(401);
    const limited = await attempt().expect(429);
    expect(limited.body).toMatchObject({ statusCode: 429, error: 'Too Many Requests' });
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
