import { ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import type { Request, Response } from 'express';
import { vi } from 'vitest';
import { AuthController } from './auth.controller.js';
import { RefreshTokenError } from './token.service.js';
import type { AuthService } from './auth.service.js';

describe('AuthController.refresh', () => {
  const auth = { refresh: vi.fn() };
  const controller = new AuthController(auth as unknown as AuthService, {
    secure: true,
    maxAgeSeconds: 60,
  });
  const req = { cookies: { refresh_token: 'old' } } as unknown as Request;
  const res = () =>
    ({ cookie: vi.fn(), clearCookie: vi.fn() }) as unknown as Response & {
      cookie: ReturnType<typeof vi.fn>;
      clearCookie: ReturnType<typeof vi.fn>;
    };

  it('clears the cookie when the token is invalid, expired or reused', async () => {
    for (const error of [new RefreshTokenError('reused'), new UnauthorizedException()]) {
      auth.refresh.mockRejectedValueOnce(error);
      const response = res();
      await expect(controller.refresh(req, response)).rejects.toBe(error);
      expect(response.clearCookie).toHaveBeenCalledOnce();
    }
  });

  it('keeps the cookie when the failure is temporary, so an outage does not sign people out', async () => {
    const outage = new ServiceUnavailableException();
    auth.refresh.mockRejectedValueOnce(outage);
    const response = res();
    await expect(controller.refresh(req, response)).rejects.toBe(outage);
    expect(response.clearCookie).not.toHaveBeenCalled();
  });
});
