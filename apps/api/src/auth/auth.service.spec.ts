import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { vi } from 'vitest';
import { EmailAlreadyRegisteredError, type User } from '../users/user.model.js';
import { UsersRepository } from '../users/users.repository.js';
import { AuthService } from './auth.service.js';
import { PasswordHasher } from './password-hasher.js';
import { TokenService } from './token.service.js';
import { RefreshTokenRotator } from './refresh-tokens/refresh-token-rotator.js';

describe('AuthService', () => {
  const ada: User = {
    id: '64b7f0f0f0f0f0f0f0f0f0f0',
    email: 'ada@example.com',
    name: 'Ada Lovelace',
    createdAt: new Date('2026-01-01T00:00:00Z'),
  };
  const pair = { accessToken: 'access', expiresIn: 900, refreshToken: 'refresh' };

  const users = {
    create: vi.fn(),
    findCredentialsByEmail: vi.fn(),
    updatePasswordHash: vi.fn(),
  };
  const tokens = { issue: vi.fn(), revoke: vi.fn() };
  const rotator = { rotate: vi.fn() };
  // The real hasher at a low cost: fast, and proves hashes are never stored in plain text.
  const hasher = new PasswordHasher({ logN: 11 });
  let auth: AuthService;

  beforeEach(async () => {
    vi.resetAllMocks();
    tokens.issue.mockResolvedValue(pair);
    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersRepository, useValue: users },
        { provide: TokenService, useValue: tokens },
        { provide: RefreshTokenRotator, useValue: rotator },
        { provide: PasswordHasher, useValue: hasher },
      ],
    }).compile();
    auth = moduleRef.get(AuthService);
  });

  describe('signUp', () => {
    const input = { email: ada.email, name: ada.name, password: 'Analytical1!' };

    it('stores a hash of the password, never the password itself', async () => {
      users.create.mockResolvedValue(ada);
      await auth.signUp(input);
      const stored = users.create.mock.calls[0][0];
      expect(stored).toMatchObject({ email: ada.email, name: ada.name });
      expect(stored.passwordHash).not.toContain(input.password);
      expect(await hasher.verify(input.password, stored.passwordHash)).toBe(true);
    });

    it('signs the new user in', async () => {
      users.create.mockResolvedValue(ada);
      expect(await auth.signUp(input)).toEqual({ tokens: pair, user: ada });
      expect(tokens.issue).toHaveBeenCalledWith(ada.id);
    });

    it('answers 409 when the email is taken', async () => {
      users.create.mockRejectedValue(new EmailAlreadyRegisteredError());
      await expect(auth.signUp(input)).rejects.toBeInstanceOf(ConflictException);
      expect(tokens.issue).not.toHaveBeenCalled();
    });

    it('lets unexpected database errors through for the global filter', async () => {
      users.create.mockRejectedValue(new Error('connection lost'));
      await expect(auth.signUp(input)).rejects.toThrow('connection lost');
    });
  });

  describe('signIn', () => {
    it('signs in with the right password', async () => {
      users.findCredentialsByEmail.mockResolvedValue({
        user: ada,
        passwordHash: await hasher.hash('Analytical1!'),
      });
      expect(await auth.signIn({ email: ada.email, password: 'Analytical1!' })).toEqual({
        tokens: pair,
        user: ada,
      });
    });

    it('answers the same 401 for a wrong password and an unknown email', async () => {
      users.findCredentialsByEmail.mockResolvedValueOnce({
        user: ada,
        passwordHash: await hasher.hash('Analytical1!'),
      });
      const wrongPassword = await auth
        .signIn({ email: ada.email, password: 'nope' })
        .catch((error: unknown) => error);

      users.findCredentialsByEmail.mockResolvedValueOnce(null);
      const unknownEmail = await auth
        .signIn({ email: 'who@example.com', password: 'nope' })
        .catch((error: unknown) => error);

      expect(wrongPassword).toBeInstanceOf(UnauthorizedException);
      expect(unknownEmail).toBeInstanceOf(UnauthorizedException);
      expect((wrongPassword as UnauthorizedException).getResponse()).toEqual(
        (unknownEmail as UnauthorizedException).getResponse(),
      );
      expect(tokens.issue).not.toHaveBeenCalled();
    });

    it('still runs the hash check for an unknown email, so timing does not reveal accounts', async () => {
      const verify = vi.spyOn(hasher, 'verify');
      users.findCredentialsByEmail.mockResolvedValue(null);
      await auth.signIn({ email: 'who@example.com', password: 'nope' }).catch(() => undefined);
      expect(verify).toHaveBeenCalledWith('nope', undefined);
      verify.mockRestore();
    });

    it('upgrades a hash made with weaker parameters', async () => {
      const weak = await new PasswordHasher({ logN: 10 }).hash('Analytical1!');
      users.findCredentialsByEmail.mockResolvedValue({ user: ada, passwordHash: weak });
      await auth.signIn({ email: ada.email, password: 'Analytical1!' });
      expect(users.updatePasswordHash).toHaveBeenCalledWith(ada.id, expect.any(String));
    });
  });

  describe('refresh', () => {
    it('rotates the refresh token', async () => {
      rotator.rotate.mockResolvedValue(pair);
      expect(await auth.refresh('old')).toEqual(pair);
      expect(rotator.rotate).toHaveBeenCalledWith('old');
    });

    it('answers 401 when there is no refresh token', async () => {
      await expect(auth.refresh(undefined)).rejects.toBeInstanceOf(UnauthorizedException);
      expect(rotator.rotate).not.toHaveBeenCalled();
    });
  });

  describe('signOut', () => {
    it('revokes the refresh token family', async () => {
      await auth.signOut('current');
      expect(tokens.revoke).toHaveBeenCalledWith('current');
    });

    it('is a no-op without a refresh token, so logout is idempotent', async () => {
      await auth.signOut(undefined);
      expect(tokens.revoke).not.toHaveBeenCalled();
    });
  });
});
