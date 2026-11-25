import type { SignInPayload, SignUpPayload, UserProfile } from '@auth-app/shared';
import { createContext, useContext } from 'react';

export type SessionStatus = 'loading' | 'authenticated' | 'anonymous';

export interface SessionContextValue {
  status: SessionStatus;
  user: UserProfile | null;
  signIn: (payload: SignInPayload) => Promise<UserProfile>;
  signUp: (payload: SignUpPayload) => Promise<UserProfile>;
  signOut: () => Promise<void>;
  isSigningOut: boolean;
}

export const SessionContext = createContext<SessionContextValue | null>(null);

export function useSession(): SessionContextValue {
  const context = useContext(SessionContext);
  if (!context) throw new Error('useSession must be used inside <SessionProvider>');
  return context;
}
