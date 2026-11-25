import type { INestApplication } from '@nestjs/common';
import { apiErrorSchema, authSessionSchema, userProfileSchema } from '@auth-app/shared';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { closeTestApp, cookieValue, createTestApp } from './utils/app.js';

const REFRESH_COOKIE = 'refresh_token';

describe('Authentication (e2e)', () => {
  let app: INestApplication<App>;
  const ada = { email: 'ada@example.com', name: 'Ada Lovelace', password: 'Analytical1!' };

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await closeTestApp(app);
  });

  const http = () => request(app.getHttpServer());
  const signUp = (body: object) => http().post('/api/v1/auth/signup').send(body);
  const signIn = (body: object) => http().post('/api/v1/auth/signin').send(body);
  const refresh = (cookie?: string) => {
    const req = http().post('/api/v1/auth/refresh');
    return cookie ? req.set('Cookie', cookie) : req;
  };

  describe('POST /api/v1/auth/signup', () => {
    it('creates the account, signs it in and sets the refresh cookie', async () => {
      const res = await signUp(ada).expect(201);

      const session = authSessionSchema.parse(res.body);
      expect(session.user).toMatchObject({ email: ada.email, name: ada.name });
      expect(res.body.user).not.toHaveProperty('passwordHash');

      const setCookie = res.headers['set-cookie'] as unknown as string[];
      const cookie = setCookie.find((header) => header.startsWith(`${REFRESH_COOKIE}=`));
      expect(cookie).toMatch(/HttpOnly/i);
      expect(cookie).toMatch(/SameSite=Strict/i);
      expect(cookie).toMatch(/Path=\/api\/v1\/auth/);
      expect(cookie).toMatch(/Max-Age=604800/);
      // The refresh token is never exposed to JavaScript.
      expect(JSON.stringify(res.body)).not.toContain(
        cookieValue(setCookie, REFRESH_COOKIE)!.split('=')[1],
      );
    });

    it('normalises the email, so a different letter case is the same account', async () => {
      const res = await signUp({ ...ada, email: '  ADA@Example.com ' }).expect(409);
      expect(apiErrorSchema.parse(res.body)).toMatchObject({
        statusCode: 409,
        error: 'Conflict',
        message: 'An account with this email already exists',
      });
    });

    it('answers 400 with every broken rule', async () => {
      const res = await signUp({ email: 'not-an-email', name: 'Al', password: 'short' }).expect(
        400,
      );
      const body = apiErrorSchema.parse(res.body);
      expect(body).toMatchObject({
        statusCode: 400,
        error: 'Bad Request',
        path: '/api/v1/auth/signup',
      });
      expect(body.message).toEqual(
        expect.arrayContaining([
          expect.stringContaining('email'),
          expect.stringContaining('Name must be at least 3 characters'),
          expect.stringContaining('Password must be at least 8 characters'),
          expect.stringContaining('Password must contain at least one number'),
          expect.stringContaining('Password must contain at least one special character'),
        ]),
      );
    });

    it('rejects unknown fields instead of silently ignoring them', async () => {
      await signUp({ ...ada, email: 'mallory@example.com', role: 'admin' }).expect(400);
    });
  });

  describe('POST /api/v1/auth/signin', () => {
    it('signs in with the right credentials', async () => {
      const res = await signIn({ email: ada.email, password: ada.password }).expect(200);
      expect(authSessionSchema.parse(res.body).user.email).toBe(ada.email);
      expect(cookieValue(res.headers['set-cookie'], REFRESH_COOKIE)).toBeDefined();
    });

    it('answers a wrong password and an unknown email identically', async () => {
      const wrong = await signIn({ email: ada.email, password: 'Wrong-pass1' }).expect(401);
      const unknown = await signIn({ email: 'nobody@example.com', password: 'Wrong-pass1' }).expect(
        401,
      );
      const strip = ({ timestamp: _t, requestId: _r, ...rest }: Record<string, unknown>) => rest;
      expect(strip(wrong.body)).toEqual(strip(unknown.body));
      expect(wrong.body.message).toBe('Invalid email or password');
    });

    it('does not apply sign-up strength rules', async () => {
      await signIn({ email: ada.email, password: 'x' }).expect(401);
    });
  });

  describe('GET /api/v1/users/me (protected)', () => {
    it('answers 401 without a token', async () => {
      const res = await http().get('/api/v1/users/me').expect(401);
      expect(apiErrorSchema.parse(res.body).statusCode).toBe(401);
    });

    it('answers 401 with a forged token', async () => {
      await http().get('/api/v1/users/me').set('Authorization', 'Bearer not.a.jwt').expect(401);
    });

    it('returns the signed-in user', async () => {
      const { body } = await signIn({ email: ada.email, password: ada.password }).expect(200);
      const res = await http()
        .get('/api/v1/users/me')
        .set('Authorization', `Bearer ${body.accessToken}`)
        .expect(200);
      expect(userProfileSchema.parse(res.body)).toEqual(body.user);
    });
  });

  describe('refresh-token rotation', () => {
    it('rotates the refresh token and issues a working access token', async () => {
      const signedIn = await signIn({ email: ada.email, password: ada.password }).expect(200);
      const first = cookieValue(signedIn.headers['set-cookie'], REFRESH_COOKIE)!;

      const res = await refresh(first).expect(200);
      const second = cookieValue(res.headers['set-cookie'], REFRESH_COOKIE)!;
      expect(second).toBeDefined();
      expect(second).not.toBe(first);

      await http()
        .get('/api/v1/users/me')
        .set('Authorization', `Bearer ${res.body.accessToken}`)
        .expect(200);
    });

    it('treats a reused refresh token as theft and revokes the whole session', async () => {
      const signedIn = await signIn({ email: ada.email, password: ada.password }).expect(200);
      const stolen = cookieValue(signedIn.headers['set-cookie'], REFRESH_COOKIE)!;
      const legit = cookieValue(
        (await refresh(stolen).expect(200)).headers['set-cookie'],
        REFRESH_COOKIE,
      )!;

      await refresh(stolen).expect(401);
      // The legitimate holder's newer token died with the family.
      await refresh(legit).expect(401);
    });

    it('answers 401 without a cookie', async () => {
      await refresh().expect(401);
    });
  });

  describe('POST /api/v1/auth/logout', () => {
    it('revokes the session and clears the cookie', async () => {
      const signedIn = await signIn({ email: ada.email, password: ada.password }).expect(200);
      const cookie = cookieValue(signedIn.headers['set-cookie'], REFRESH_COOKIE)!;

      const res = await http().post('/api/v1/auth/logout').set('Cookie', cookie).expect(204);
      expect(res.headers['set-cookie']?.[0]).toMatch(/refresh_token=;.*Expires=Thu, 01 Jan 1970/);

      await refresh(cookie).expect(401);
    });

    it('succeeds without a session, so logging out twice is harmless', async () => {
      await http().post('/api/v1/auth/logout').expect(204);
    });
  });

  describe('cross-cutting', () => {
    it('refuses state-changing requests from another site (CSRF)', async () => {
      await http()
        .post('/api/v1/auth/signin')
        .set('Sec-Fetch-Site', 'cross-site')
        .set('Origin', 'https://evil.example')
        .send({ email: ada.email, password: ada.password })
        .expect(403);
    });

    it('propagates a caller-provided request id into the response and error body', async () => {
      const res = await http().get('/api/v1/users/me').set('X-Request-Id', 'trace-123').expect(401);
      expect(res.headers['x-request-id']).toBe('trace-123');
      expect(res.body.requestId).toBe('trace-123');
    });

    it('sets security headers', async () => {
      const res = await http().get('/health').expect(200);
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers).not.toHaveProperty('x-powered-by');
    });

    it('answers unknown routes with the standard error shape', async () => {
      const res = await http().get('/api/v1/nope').expect(404);
      expect(apiErrorSchema.parse(res.body).statusCode).toBe(404);
    });
  });
});
