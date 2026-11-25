import { screen } from '@testing-library/react';
import { fakeApi } from '@/test/fake-api';
import { renderApp } from '@/test/render-app';

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

  it('shows a page for unknown addresses', async () => {
    renderApp('/nowhere');
    expect(
      await screen.findByRole('heading', { name: 'This page doesn’t exist' }),
    ).toBeInTheDocument();
  });
});
