import type { AuthSession, UserProfile } from '@auth-app/shared';
import { http, HttpResponse } from 'msw';

/**
 * A small in-memory stand-in for the real API, enough to drive the UI through every flow.
 * (The real API has its own e2e suite; Playwright covers the two together.)
 */
interface FakeUser {
  profile: UserProfile;
  password: string;
}

export const fakeApi = {
  users: new Map<string, FakeUser>(),
  /** Whether the browser holds a valid refresh cookie. */
  hasRefreshCookie: false,
  currentUserEmail: null as string | null,
  validAccessTokens: new Set<string>(),
  refreshCalls: 0,

  reset() {
    this.users.clear();
    this.hasRefreshCookie = false;
    this.currentUserEmail = null;
    this.validAccessTokens.clear();
    this.refreshCalls = 0;
  },

  addUser(email: string, name: string, password: string): UserProfile {
    const profile = {
      id: `id-${this.users.size + 1}`,
      email,
      name,
      createdAt: '2026-03-01T10:00:00.000Z',
    };
    this.users.set(email, { profile, password });
    return profile;
  },

  /** Starts a session as if the person had signed in earlier and reloaded the page. */
  signInAs(email: string) {
    this.hasRefreshCookie = true;
    this.currentUserEmail = email;
  },

  issueAccessToken(): string {
    const token = `access-${crypto.randomUUID()}`;
    this.validAccessTokens.add(token);
    return token;
  },
};

const error = (statusCode: number, errorName: string, message: string | string[]) =>
  HttpResponse.json(
    { statusCode, error: errorName, message, path: '/', timestamp: new Date().toISOString() },
    { status: statusCode },
  );

function session(email: string): AuthSession {
  fakeApi.hasRefreshCookie = true;
  fakeApi.currentUserEmail = email;
  return {
    accessToken: fakeApi.issueAccessToken(),
    expiresIn: 900,
    user: fakeApi.users.get(email)!.profile,
  };
}

export const handlers = [
  http.post('*/api/v1/auth/signup', async ({ request }) => {
    const body = (await request.json()) as { email: string; name: string; password: string };
    const email = body.email.trim().toLowerCase();
    if (fakeApi.users.has(email))
      return error(409, 'Conflict', 'An account with this email already exists');
    fakeApi.addUser(email, body.name.trim(), body.password);
    return HttpResponse.json(session(email), { status: 201 });
  }),

  http.post('*/api/v1/auth/signin', async ({ request }) => {
    const body = (await request.json()) as { email: string; password: string };
    const user = fakeApi.users.get(body.email.trim().toLowerCase());
    if (!user || user.password !== body.password)
      return error(401, 'Unauthorized', 'Invalid email or password');
    return HttpResponse.json(session(user.profile.email));
  }),

  http.post('*/api/v1/auth/refresh', () => {
    fakeApi.refreshCalls += 1;
    if (!fakeApi.hasRefreshCookie) return error(401, 'Unauthorized', 'No active session');
    return HttpResponse.json({ accessToken: fakeApi.issueAccessToken(), expiresIn: 900 });
  }),

  http.post('*/api/v1/auth/logout', () => {
    fakeApi.hasRefreshCookie = false;
    fakeApi.currentUserEmail = null;
    fakeApi.validAccessTokens.clear();
    return new HttpResponse(null, { status: 204 });
  }),

  http.get('*/api/v1/users/me', ({ request }) => {
    const token = request.headers.get('Authorization')?.replace('Bearer ', '');
    if (!token || !fakeApi.validAccessTokens.has(token) || !fakeApi.currentUserEmail) {
      return error(401, 'Unauthorized', 'Missing or invalid token');
    }
    return HttpResponse.json(fakeApi.users.get(fakeApi.currentUserEmail)!.profile);
  }),
];
