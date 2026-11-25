import { expect, test, type Page } from '@playwright/test';

/** A fresh account per test, so tests can run in parallel against one database. */
function newAccount() {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return { email: `e2e-${id}@example.com`, name: 'Ada Lovelace', password: 'Analytical1!' };
}

async function signUp(page: Page, account: ReturnType<typeof newAccount>) {
  await page.goto('/signup');
  await page.getByLabel('Email').fill(account.email);
  await page.getByLabel('Name').fill(account.name);
  await page.getByLabel('Password', { exact: true }).fill(account.password);
  await page.getByRole('button', { name: 'Create account' }).click();
}

const welcome = (page: Page) => page.getByRole('heading', { name: 'Welcome to the application.' });

test('sign up, reload, sign out and sign in again', async ({ page }) => {
  const account = newAccount();

  await signUp(page, account);
  await expect(welcome(page)).toBeVisible();
  await expect(page).toHaveURL(/\/app$/);
  await expect(page.getByText(account.email)).toBeVisible();

  // The access token is in memory only: a reload restores the session from the httpOnly cookie.
  await page.reload();
  await expect(welcome(page)).toBeVisible();

  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();

  // Signed out for real: the application is closed again.
  await page.goto('/app');
  await expect(page).toHaveURL(/\/signin$/);

  await page.getByLabel('Email').fill(account.email);
  await page.getByLabel('Password', { exact: true }).fill(account.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(welcome(page)).toBeVisible();
});

test('the refresh token is not readable from JavaScript', async ({ page, context }) => {
  await signUp(page, newAccount());
  await expect(welcome(page)).toBeVisible();

  const cookies = await context.cookies();
  const refresh = cookies.find((cookie) => cookie.name === 'refresh_token');
  expect(refresh).toMatchObject({ httpOnly: true, sameSite: 'Strict', path: '/api/v1/auth' });

  expect(await page.evaluate(() => document.cookie)).not.toContain('refresh_token');
  expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toMatch(/eyJ/);
});

test('sign-up validates every field before calling the API', async ({ page }) => {
  await page.goto('/signup');
  await page.getByLabel('Email').fill('not-an-email');
  await page.getByLabel('Name').fill('Al');
  await page.getByLabel('Password', { exact: true }).fill('abc');
  await page.getByRole('button', { name: 'Create account' }).click();

  await expect(page.getByText('Enter a valid email address')).toBeVisible();
  await expect(page.getByText('Name must be at least 3 characters')).toBeVisible();
  await expect(page.getByText('1 of 4 password requirements met', { exact: true })).toBeAttached();
  await expect(page).toHaveURL(/\/signup$/);
});

test('signing up twice with one email is refused', async ({ page }) => {
  const account = newAccount();
  await signUp(page, account);
  await expect(welcome(page)).toBeVisible();
  await page.getByRole('button', { name: 'Sign out' }).click();

  await signUp(page, { ...account, email: account.email.toUpperCase() });
  await expect(page.getByText('An account with this email already exists')).toBeVisible();
});

test('a wrong password is refused without saying which part was wrong', async ({ page }) => {
  const account = newAccount();
  await signUp(page, account);
  await page.getByRole('button', { name: 'Sign out' }).click();

  await page.getByLabel('Email').fill(account.email);
  await page.getByLabel('Password', { exact: true }).fill('Wrong-password1');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('alert')).toHaveText('Invalid email or password');
});

test('screenshots of every screen', async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const shot = async (name: string) =>
    page.screenshot({ path: testInfo.outputPath(`${name}.png`), fullPage: true });

  await page.goto('/signup');
  await page.getByLabel('Password', { exact: true }).fill('abcdef1');
  await shot('signup');
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  await shot('signup-dark');
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  await page.goto('/signin');
  await shot('signin');
  await signUp(page, newAccount());
  await expect(welcome(page)).toBeVisible();
  await shot('app');
});
