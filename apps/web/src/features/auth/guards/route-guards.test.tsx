import { screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { routes } from '@/app/routes';
import { fakeApi } from '@/test/fake-api';
import { renderApp } from '@/test/render-app';
import { server } from '@/test/setup';
import { RequireAuth } from './route-guards';

describe('Route guards', () => {
  it('sends signed-out visitors from the application to sign in', async () => {
    const { router } = renderApp('/app');
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/signin');
  });

  it('restores the session after a reload from the refresh cookie', async () => {
    fakeApi.addUser('ada@example.com', 'Ada Lovelace', 'Analytical1!');
    fakeApi.signInAs('ada@example.com');
    renderApp('/app');
    expect(
      await screen.findByRole('heading', { name: 'Welcome to the application.' }),
    ).toBeInTheDocument();
  });

  it('sends signed-in people away from the auth pages', async () => {
    fakeApi.addUser('ada@example.com', 'Ada Lovelace', 'Analytical1!');
    fakeApi.signInAs('ada@example.com');
    const { router } = renderApp('/signup');
    expect(
      await screen.findByRole('heading', { name: 'Welcome to the application.' }),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/app');
  });

  it('offers a retry instead of sign-in when the session cannot be checked', async () => {
    fakeApi.addUser('ada@example.com', 'Ada Lovelace', 'Analytical1!');
    fakeApi.signInAs('ada@example.com');
    server.use(http.post('*/api/v1/auth/refresh', () => new HttpResponse(null, { status: 503 })));
    const { router, user } = renderApp('/app');
    expect(
      await screen.findByRole('heading', { name: 'We can’t reach the server' }),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/app');

    server.resetHandlers(); // the server is back
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(
      await screen.findByRole('heading', { name: 'Welcome to the application.' }),
    ).toBeInTheDocument();
  });

  it('asks to sign in when the retry finds that the session is over', async () => {
    server.use(http.post('*/api/v1/auth/refresh', () => new HttpResponse(null, { status: 503 })));
    const { user } = renderApp('/app');
    await screen.findByRole('heading', { name: 'We can’t reach the server' });

    server.resetHandlers();
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
  });

  it('keeps the sign-in form usable when the session cannot be checked', async () => {
    server.use(http.post('*/api/v1/auth/refresh', () => new HttpResponse(null, { status: 503 })));
    renderApp('/signin');
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
  });

  it('goes back to the page that asked for sign-in', async () => {
    fakeApi.addUser('ada@example.com', 'Ada Lovelace', 'Analytical1!');
    // The real guards around a second protected page, so a fallback to /app would be noticed.
    const { router, user } = renderApp('/reports', [
      ...routes,
      { element: <RequireAuth />, children: [{ path: 'reports', element: <h1>Reports</h1> }] },
    ]);
    await user.type(await screen.findByLabelText('Email'), 'ada@example.com');
    await user.type(screen.getByLabelText('Password'), 'Analytical1!');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByRole('heading', { name: 'Reports' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/reports');
  });

  it('shows a page for unknown addresses', async () => {
    renderApp('/nowhere');
    expect(
      await screen.findByRole('heading', { name: 'This page doesn’t exist' }),
    ).toBeInTheDocument();
  });
});
