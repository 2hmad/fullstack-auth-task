import { userProfileSchema } from '@auth-app/shared';
import { http, HttpResponse } from 'msw';
import { fakeApi } from '@/test/fake-api';
import { server } from '@/test/setup';
import { accessTokenStore } from './access-token';
import { ApiError } from './api-error';
import { apiRequest, onSessionExpired, refreshAccessToken } from './http';

describe('apiRequest', () => {
  beforeEach(() => {
    fakeApi.addUser('ada@example.com', 'Ada', 'Analytical1!');
    fakeApi.signInAs('ada@example.com');
  });

  it('renews an expired access token once and retries the request', async () => {
    accessTokenStore.set('expired-token');
    const profile = await apiRequest('/users/me', { schema: userProfileSchema });
    expect(profile.email).toBe('ada@example.com');
    expect(fakeApi.refreshCalls).toBe(1);
    expect(accessTokenStore.get()).not.toBe('expired-token');
  });

  it('shares one refresh between concurrent requests', async () => {
    accessTokenStore.set('expired-token');
    await Promise.all([1, 2, 3].map(() => apiRequest('/users/me', { schema: userProfileSchema })));
    expect(fakeApi.refreshCalls).toBe(1);
  });

  it('drops a refresh that finishes after sign-out', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    server.use(
      http.post('*/api/v1/auth/refresh', async () => {
        await gate;
        return HttpResponse.json({ accessToken: 'late-token', expiresIn: 900 });
      }),
    );
    const pending = refreshAccessToken();
    accessTokenStore.clear(); // the user signs out meanwhile
    release();
    expect(await pending).toBeNull();
    expect(accessTokenStore.get()).toBeNull();
  });

  it('reports an expired session when the refresh fails too', async () => {
    fakeApi.hasRefreshCookie = false;
    accessTokenStore.set('expired-token');
    const expired = vi.fn();
    const unsubscribe = onSessionExpired(expired);

    await expect(apiRequest('/users/me')).rejects.toMatchObject({ status: 401 });
    expect(expired).toHaveBeenCalledOnce();
    expect(accessTokenStore.get()).toBeNull();
    unsubscribe();
  });

  it.each([429, 500, 503])('keeps the session when the refresh answers %i', async (status) => {
    server.use(http.post('*/api/v1/auth/refresh', () => new HttpResponse(null, { status })));
    accessTokenStore.set('expired-token');
    const expired = vi.fn();
    const unsubscribe = onSessionExpired(expired);

    await expect(apiRequest('/users/me')).rejects.toMatchObject({ status });
    expect(expired).not.toHaveBeenCalled();
    expect(accessTokenStore.get()).toBe('expired-token');
    unsubscribe();
  });

  it('keeps the session when the refresh never reaches the server', async () => {
    server.use(http.post('*/api/v1/auth/refresh', () => HttpResponse.error()));
    accessTokenStore.set('expired-token');
    await expect(apiRequest('/users/me')).rejects.toMatchObject({ status: 0 });
    expect(accessTokenStore.get()).toBe('expired-token');
  });

  it('does not refresh when a credential endpoint answers 401', async () => {
    accessTokenStore.set('some-token');
    await expect(
      apiRequest('/auth/signin', {
        method: 'POST',
        body: { email: 'ada@example.com', password: 'nope' },
        authenticated: false,
      }),
    ).rejects.toBeInstanceOf(ApiError);
    expect(fakeApi.refreshCalls).toBe(0);
  });

  it('rejects responses that do not match the contract', async () => {
    server.use(http.get('*/api/v1/users/me', () => HttpResponse.json({ unexpected: true })));
    await expect(apiRequest('/users/me', { schema: userProfileSchema })).rejects.toThrow();
  });

  it('keeps every validation message from the API', async () => {
    server.use(
      http.post('*/api/v1/auth/signup', () =>
        HttpResponse.json(
          {
            statusCode: 400,
            error: 'Bad Request',
            message: ['a', 'b'],
            path: '/',
            timestamp: new Date().toISOString(),
          },
          { status: 400 },
        ),
      ),
    );
    await expect(apiRequest('/auth/signup', { method: 'POST', body: {} })).rejects.toMatchObject({
      status: 400,
      messages: ['a', 'b'],
    });
  });
});
