import type { SignInPayload, SignUpPayload, UserProfile } from '@auth-app/shared';
import { createContext, useContext } from 'react';

/** `unavailable`: the server could not be asked, so nobody knows whether there is a session. */
export type SessionStatus = 'loading' | 'authenticated' | 'anonymous' | 'unavailable';

export interface SessionContextValue {
  status: SessionStatus;
  user: UserProfile | null;
  signIn: (payload: SignInPayload) => Promise<UserProfile>;
  signUp: (payload: SignUpPayload) => Promise<UserProfile>;
  signOut: () => Promise<void>;
  isSigningOut: boolean;
  /** Checks the session again while `unavailable`. */
  retry: () => void;
  isRetrying: boolean;
}

export const SessionContext = createContext<SessionContextValue | null>(null);

export function useSession(): SessionContextValue {
  const context = useContext(SessionContext);
  if (!context) throw new Error('useSession must be used inside <SessionProvider>');
  return context;
}
