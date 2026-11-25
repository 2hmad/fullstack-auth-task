import type { UserProfile } from '@auth-app/shared';
import type { User } from './user.model.js';

export function toUserProfile(user: User): UserProfile {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    createdAt: user.createdAt.toISOString(),
  };
}
