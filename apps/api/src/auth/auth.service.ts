import { ConflictException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { PasswordHasher, TokenService, type TokenPair } from '@nestjs/authentication';
import type { SignInPayload, SignUpPayload } from '@auth-app/shared';
import { EmailAlreadyRegisteredError, type User } from '../users/user.model.js';
import { UsersRepository } from '../users/users.repository.js';

export interface SignedIn {
  tokens: TokenPair;
  user: User;
}

const INVALID_CREDENTIALS = 'Invalid email or password';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly users: UsersRepository,
    private readonly passwordHasher: PasswordHasher,
    private readonly tokens: TokenService,
  ) {}

  async signUp({ email, name, password }: SignUpPayload): Promise<SignedIn> {
    const passwordHash = await this.passwordHasher.hash(password);
    let user: User;
    try {
      // Insert and let the unique index decide: a lookup first would race.
      user = await this.users.create({ email, name, passwordHash });
    } catch (error) {
      if (error instanceof EmailAlreadyRegisteredError) {
        throw new ConflictException('An account with this email already exists');
      }
      throw error;
    }
    this.logger.log({ userId: user.id }, 'User signed up');
    return this.issue(user);
  }

  async signIn({ email, password }: SignInPayload): Promise<SignedIn> {
    const found = await this.users.findCredentialsByEmail(email);
    // Always verify, even without a user: verify() then checks a dummy hash, so an
    // unknown email takes as long as a wrong password and cannot be told apart.
    const valid = await this.passwordHasher.verify(password, found?.passwordHash);
    if (!valid || !found) {
      this.logger.warn('Failed sign-in attempt');
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }
    if (this.passwordHasher.needsRehash(found.passwordHash)) {
      await this.users.updatePasswordHash(found.user.id, await this.passwordHasher.hash(password));
    }
    this.logger.log({ userId: found.user.id }, 'User signed in');
    return this.issue(found.user);
  }

  /** Spends the refresh token for a new pair. Unknown, expired or reused tokens are a 401. */
  async refresh(refreshToken: string | undefined): Promise<TokenPair> {
    if (!refreshToken) throw new UnauthorizedException('No active session');
    return this.tokens.refresh(refreshToken);
  }

  /** Revokes the session's refresh-token family. Same answer whether or not the token was known. */
  async signOut(refreshToken: string | undefined): Promise<void> {
    if (!refreshToken) return;
    await this.tokens.revoke(refreshToken);
  }

  private async issue(user: User): Promise<SignedIn> {
    const tokens = await this.tokens.issue(user.id, { method: 'password' });
    return { tokens, user };
  }
}
