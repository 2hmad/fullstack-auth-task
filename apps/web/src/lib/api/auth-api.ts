import {
  authSessionSchema,
  userProfileSchema,
  type AuthSession,
  type SignInPayload,
  type SignUpPayload,
  type UserProfile,
} from '@auth-app/shared';
import { accessTokenStore } from './access-token';
import { apiRequest, refreshAccessToken } from './http';

async function startSession(request: Promise<AuthSession>): Promise<UserProfile> {
  const session = await request;
  accessTokenStore.set(session.accessToken);
  return session.user;
}

export const authApi = {
  signUp: (payload: SignUpPayload) =>
    startSession(
      apiRequest('/auth/signup', {
        method: 'POST',
        body: payload,
        schema: authSessionSchema,
        authenticated: false,
      }),
    ),

  signIn: (payload: SignInPayload) =>
    startSession(
      apiRequest('/auth/signin', {
        method: 'POST',
        body: payload,
        schema: authSessionSchema,
        authenticated: false,
      }),
    ),

  me: () => apiRequest('/users/me', { schema: userProfileSchema }),

  /** Restores the session after a reload. Null when the visitor is signed out. */
  async restoreSession(): Promise<UserProfile | null> {
    const token = await refreshAccessToken();
    return token ? authApi.me() : null;
  },

  /**
   * Revokes the session on the server, then forgets the access token. If the request fails the
   * session is still alive server-side, so the error propagates and the user stays signed in
   * rather than being told they are signed out when they are not.
   */
  async signOut(): Promise<void> {
    await apiRequest('/auth/logout', { method: 'POST', authenticated: false });
    accessTokenStore.clear();
  },
};
