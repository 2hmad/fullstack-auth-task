import { screen } from '@testing-library/react';
import { fakeApi } from '@/test/fake-api';
import { renderApp } from '@/test/render-app';

describe('Sign up', () => {
  it('shows every broken rule next to its field', async () => {
    const { user } = renderApp('/signup');
    await user.click(await screen.findByRole('button', { name: 'Create account' }));

    expect(screen.getByLabelText('Email')).toHaveAccessibleDescription(
      'Enter a valid email address',
    );
    expect(screen.getByLabelText('Name')).toHaveAccessibleDescription(
      'Name must be at least 3 characters',
    );
    expect(screen.getByLabelText('Password')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText('Password must be at least 8 characters')).toBeInTheDocument();
  });

  it('creates the account and opens the application', async () => {
    const { user } = renderApp('/signup');
    await user.type(await screen.findByLabelText('Email'), 'ada@example.com');
    await user.type(screen.getByLabelText('Name'), 'Ada Lovelace');
    await user.type(screen.getByLabelText('Password'), 'Analytical1!');
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    expect(
      await screen.findByRole('heading', { name: 'Welcome to the application.' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();
  });

  it('puts the "email taken" answer on the email field', async () => {
    fakeApi.addUser('ada@example.com', 'Ada', 'Analytical1!');
    const { user } = renderApp('/signup');
    await user.type(await screen.findByLabelText('Email'), 'ada@example.com');
    await user.type(screen.getByLabelText('Name'), 'Ada Again');
    await user.type(screen.getByLabelText('Password'), 'Analytical1!');
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    expect(
      await screen.findByText('An account with this email already exists'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toHaveFocus();
  });

  it('lets people check the password they typed', async () => {
    const { user } = renderApp('/signup');
    const password = await screen.findByLabelText('Password');
    expect(password).toHaveAttribute('type', 'password');
    await user.click(screen.getByRole('button', { name: 'Show password' }));
    expect(password).toHaveAttribute('type', 'text');
  });
});
