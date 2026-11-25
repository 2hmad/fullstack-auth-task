import { Injectable } from '@nestjs/common';
import { AuthenticationRegistry, JwtBearerProvider, type JwtClaims } from '@nestjs/authentication';
import type { User } from '../users/user.model.js';
import { UsersRepository } from '../users/users.repository.js';
import './authentication.types.js';

/**
 * Accepts `Authorization: Bearer <access token>`. The user is loaded on every request,
 * so a deleted account stops working immediately rather than when its token expires.
 */
@Injectable()
export class JwtAuthProvider extends JwtBearerProvider<User> {
  constructor(
    private readonly users: UsersRepository,
    registry: AuthenticationRegistry,
  ) {
    super();
    registry.registerProvider(this);
  }

  protected validate({ sub }: JwtClaims): Promise<User | null> | null {
    return sub ? this.users.findById(sub) : null;
  }
}
