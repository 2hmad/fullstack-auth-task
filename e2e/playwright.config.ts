import { defineConfig, devices } from '@playwright/test';

/**
 * Runs the production builds of the API and the web app (vite preview proxies /api to the API),
 * against the MongoDB at E2E_MONGODB_URI (`docker compose up -d mongo` locally, a service in CI).
 * Set E2E_BASE_URL to test an already running stack instead, e.g. `docker compose up`.
 */
const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:4173';
const mongoUri = process.env.E2E_MONGODB_URI ?? 'mongodb://localhost:27017/auth-app-e2e';
const isCI = Boolean(process.env.CI);

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  reporter: isCI
    ? [['github'], ['html', { open: 'never' }]]
    : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : [
        {
          command: 'pnpm --filter @auth-app/api start:prod',
          url: 'http://localhost:3000/health',
          reuseExistingServer: !isCI,
          env: {
            NODE_ENV: 'production',
            PORT: '3000',
            MONGODB_URI: mongoUri,
            JWT_SECRET: 'e2e-only-secret-that-is-at-least-32-bytes',
            WEB_ORIGIN: baseURL,
            // Every test signs in from the same IP.
            AUTH_THROTTLE_LIMIT: '1000',
            THROTTLE_LIMIT: '10000',
            LOG_LEVEL: 'warn',
          },
        },
        {
          command: 'pnpm --filter @auth-app/web preview --port 4173 --strictPort',
          url: baseURL,
          reuseExistingServer: !isCI,
        },
      ],
});
