import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { setupServer } from 'msw/node';
import { accessTokenStore } from '@/lib/api/access-token';
import { fakeApi, handlers } from './fake-api';

export const server = setupServer(...handlers);

beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));
afterEach(() => {
  cleanup();
  server.resetHandlers();
  fakeApi.reset();
  accessTokenStore.clear();
});
afterAll(() => server.close());
