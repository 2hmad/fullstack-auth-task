import { screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { fakeApi } from '@/test/fake-api';
import { renderApp } from '@/test/render-app';
import { server } from '@/test/setup';

async function fillAndSubmit(
  user: ReturnType<typeof renderApp>['user'],
  email: string,
  password: string,
) {
  await user.type(await screen.findByLabelText('Email'), email);
  await user.type(screen.getByLabelText('Password'), password);
  await user.click(screen.getByRole('button', { name: 'Sign in' }));
}

describe('Sign in', () => {
  beforeEach(() => {
    fakeApi.addUser('ada@example.com', 'Ada Lovelace', 'Analytical1!');
  });

  it('signs in and signs out again', async () => {
    const { user } = renderApp('/signin');
    await fillAndSubmit(user, 'ada@example.com', 'Analytical1!');

    expect(
      await screen.findByRole('heading', { name: 'Welcome to the application.' }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
    expect(fakeApi.hasRefreshCookie).toBe(false);
  });

  it('explains a failed sign-in without saying which part was wrong', async () => {
    const { user } = renderApp('/signin');
    await fillAndSubmit(user, 'ada@example.com', 'wrong-password');
    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid email or password');
  });

  it('tells people to wait when rate-limited', async () => {
    server.use(
      http.post('*/api/v1/auth/signin', () =>
        HttpResponse.json(
          {
            statusCode: 429,
            error: 'Too Many Requests',
            message: 'ThrottlerException',
            path: '/',
            timestamp: new Date().toISOString(),
          },
          { status: 429 },
        ),
      ),
    );
    const { user } = renderApp('/signin');
    await fillAndSubmit(user, 'ada@example.com', 'Analytical1!');
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Too many attempts. Wait a minute, then try again.',
    );
  });

  it('reports an unreachable server', async () => {
    server.use(http.post('*/api/v1/auth/signin', () => HttpResponse.error()));
    const { user } = renderApp('/signin');
    await fillAndSubmit(user, 'ada@example.com', 'Analytical1!');
    expect(await screen.findByRole('alert')).toHaveTextContent('Cannot reach the server');
  });
});
