import type { User } from '../users/user.model.js';

// Tells @nestjs/authentication our user type: @CurrentUser() and the providers follow it.
declare module '@nestjs/authentication' {
  interface AuthenticationTypes {
    user: User;
  }
}
