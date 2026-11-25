import { apiErrorSchema, authSessionSchema } from './auth.contracts.js';

describe('API contracts', () => {
  it('parses a session response', () => {
    const session = {
      accessToken: 'jwt',
      expiresIn: 900,
      user: {
        id: '1',
        email: 'ada@example.com',
        name: 'Ada',
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    };
    expect(authSessionSchema.parse(session)).toEqual(session);
  });

  it('rejects a session without a user', () => {
    expect(authSessionSchema.safeParse({ accessToken: 'jwt', expiresIn: 900 }).success).toBe(false);
  });

  it('accepts validation errors as a list of messages', () => {
    const body = {
      statusCode: 400,
      error: 'Bad Request',
      message: ['email: Enter a valid email address'],
      path: '/api/v1/auth/signup',
      timestamp: '2026-01-01T00:00:00.000Z',
    };
    expect(apiErrorSchema.parse(body)).toEqual(body);
  });
});
