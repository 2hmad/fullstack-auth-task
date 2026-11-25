import { randomUUID } from 'node:crypto';
import { JwtService, type JwtSignOptions } from '@nestjs/jwt';
import { getConnectionToken } from '@nestjs/mongoose';
import type { Connection } from 'mongoose';
import type { INestApplication } from '@nestjs/common';
import { apiErrorSchema, authSessionSchema, userProfileSchema } from '@auth-app/shared';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { closeTestApp, cookieValue, createTestApp, TEST_JWT_SECRET } from './utils/app.js';

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

  const me = (accessToken: string) =>
    http().get('/api/v1/users/me').set('Authorization', `Bearer ${accessToken}`);
  const sign = (claims: Record<string, unknown>, options: JwtSignOptions = {}) =>
    new JwtService().sign(
      claims,
      // An option set to undefined is left out, to sign a token without that claim.
      Object.fromEntries(
        Object.entries({
          secret: TEST_JWT_SECRET,
          issuer: 'auth-app-api',
          audience: 'auth-app-web',
          ...(claims.exp === undefined && { expiresIn: 15 * 60 }),
          ...options,
        }).filter(([, value]) => value !== undefined),
      ),
    );
  const refreshCookie = (res: request.Response) =>
    cookieValue(res.headers['set-cookie'], REFRESH_COOKIE)!;
  const signInCookie = async () =>
    refreshCookie(await signIn({ email: ada.email, password: ada.password }).expect(200));

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

    it('answers 401 for a correctly signed token that belongs to no session', async () => {
      const user = await signIn({ email: ada.email, password: ada.password }).expect(200);
      await me(sign({ sub: user.body.user.id })).expect(401);
    });

    it.each([
      ['another secret', { secret: 'another-secret-that-is-at-least-32-bytes' }],
      ['another algorithm', { algorithm: 'HS512' as const }],
      ['another issuer', { issuer: 'someone-else' }],
      ['another audience', { audience: 'another-app' }],
      ['no audience', { audience: undefined }],
      ['no issuer', { issuer: undefined }],
    ])('answers 401 for a token signed with %s', async (_case, options) => {
      const user = await signIn({ email: ada.email, password: ada.password }).expect(200);
      const claims = { sub: user.body.user.id, sid: randomUUID() };
      // The same claims are fine in a token of ours: only the option under test is wrong.
      await me(sign(claims)).expect(200);
      await me(sign(claims, options)).expect(401);
    });

    it('answers 401 for an expired token', async () => {
      const user = await signIn({ email: ada.email, password: ada.password }).expect(200);
      const claims = { sub: user.body.user.id, sid: randomUUID() };
      await me(sign({ ...claims, exp: Math.floor(Date.now() / 1000) - 60 })).expect(401);
    });

    it('answers 401 once the account is deleted', async () => {
      const grace = { email: 'grace@example.com', name: 'Grace Hopper', password: 'Compiler1!' };
      const { body } = await signUp(grace).expect(201);
      await me(body.accessToken).expect(200);
      const connection = app.get<Connection>(getConnectionToken());
      const { deletedCount } = await connection
        .collection('users')
        .deleteOne({ email: grace.email });
      expect(deletedCount).toBe(1);
      await me(body.accessToken).expect(401);
    });

    it('answers 401 for an unsigned token (alg none)', async () => {
      const user = await signIn({ email: ada.email, password: ada.password }).expect(200);
      const part = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
      const now = Math.floor(Date.now() / 1000);
      const payload = {
        sub: user.body.user.id,
        sid: randomUUID(),
        iss: 'auth-app-api',
        aud: 'auth-app-web',
        iat: now,
        exp: now + 900,
      };
      await me(`${part({ alg: 'none', typ: 'JWT' })}.${part(payload)}.`).expect(401);
    });

    it('answers 401 for a malformed Authorization header', async () => {
      const { body } = await signIn({ email: ada.email, password: ada.password }).expect(200);
      await http().get('/api/v1/users/me').set('Authorization', body.accessToken).expect(401);
      await http()
        .get('/api/v1/users/me')
        .set('Authorization', `Basic ${body.accessToken}`)
        .expect(401);
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

    it('answers a retry with the same tokens, so a lost response does not end the session', async () => {
      const first = await signInCookie();
      const answer = await refresh(first).expect(200); // imagine this never reached the browser
      const retry = await refresh(first).expect(200);

      expect(refreshCookie(retry)).toBe(refreshCookie(answer));
      await refresh(refreshCookie(retry)).expect(200);
    });

    it('treats a reused refresh token as theft and revokes the whole session', async () => {
      const stolen = await signInCookie();
      const second = refreshCookie(await refresh(stolen).expect(200));
      const answer = await refresh(second).expect(200);
      const newest = refreshCookie(answer);

      // Its successor has been used, so this cannot be a retry.
      const reuse = await refresh(stolen).expect(401);
      expect(reuse.headers['set-cookie']?.[0]).toMatch(/refresh_token=;/);

      // Everything the session still holds died with it: refresh tokens and access tokens.
      await refresh(second).expect(401);
      await refresh(newest).expect(401);
      await me(answer.body.accessToken).expect(401);
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

    it('ends the access token too, without touching the other sessions of the account', async () => {
      const [here, elsewhere] = [
        await signIn({ email: ada.email, password: ada.password }).expect(200),
        await signIn({ email: ada.email, password: ada.password }).expect(200),
      ];
      await http().post('/api/v1/auth/logout').set('Cookie', refreshCookie(here)).expect(204);

      await me(here.body.accessToken).expect(401);
      await me(elsewhere.body.accessToken).expect(200);
    });

    it('ends a session whose last refresh response was lost', async () => {
      const spent = await signInCookie();
      const unseen = await refresh(spent).expect(200);
      await http().post('/api/v1/auth/logout').set('Cookie', spent).expect(204);

      await refresh(spent).expect(401);
      await refresh(refreshCookie(unseen)).expect(401);
      await me(unseen.body.accessToken).expect(401);
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

    it('allows credentialed cross-origin reads from the web app only', async () => {
      const allowed = (origin: string) => http().get('/api/v1/users/me').set('Origin', origin);
      const ours = await allowed('http://localhost:5173');
      expect(ours.headers['access-control-allow-origin']).toBe('http://localhost:5173');
      const other = await allowed('https://evil.example');
      expect(other.headers['access-control-allow-origin']).not.toBe('https://evil.example');
      expect(other.headers['access-control-allow-origin']).not.toBe('*');
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
