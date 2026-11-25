import { http, HttpResponse } from 'msw';
import { fakeApi } from '@/test/fake-api';
import { server } from '@/test/setup';
import { accessTokenStore } from './access-token';
import { authApi } from './auth-api';

const ada = { email: 'ada@example.com', name: 'Ada Lovelace', password: 'Analytical1!' };

describe('authApi credential calls', () => {
  it.each([
    ['signin', () => authApi.signIn({ email: ada.email, password: 'Wrong-pass1' })],
    ['signup', () => authApi.signUp(ada)],
    ['logout', () => authApi.signOut()],
  ])('%s ignores a leftover access token and never refreshes on a 401', async (path, call) => {
    fakeApi.addUser(ada.email, ada.name, ada.password);
    fakeApi.signInAs(ada.email); // a refresh would succeed, so a wrong one would go unnoticed
    accessTokenStore.set('leftover-token');
    let authorization: string | null = 'not called';
    server.use(
      http.post(`*/api/v1/auth/${path}`, ({ request }) => {
        authorization = request.headers.get('Authorization');
        return HttpResponse.json(
          {
            statusCode: 401,
            error: 'Unauthorized',
            message: 'Invalid email or password',
            path: '/',
            timestamp: new Date().toISOString(),
          },
          { status: 401 },
        );
      }),
    );

    await expect(call()).rejects.toMatchObject({ status: 401 });
    expect(authorization).toBeNull();
    expect(fakeApi.refreshCalls).toBe(0);
  });
});
