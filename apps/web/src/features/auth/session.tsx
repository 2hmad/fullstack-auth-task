import type { UserProfile } from '@auth-app/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, type ReactNode } from 'react';
import { authApi } from '@/lib/api/auth-api';
import { onSessionExpired } from '@/lib/api/http';
import { SessionContext, type SessionContextValue, type SessionStatus } from './use-session';

const SESSION_QUERY_KEY = ['session'] as const;

/**
 * The signed-in user, kept in the TanStack Query cache under ['session'].
 * On first load it restores the session from the refresh cookie.
 */
export function SessionProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();

  const session = useQuery({
    queryKey: SESSION_QUERY_KEY,
    queryFn: authApi.restoreSession,
    staleTime: Infinity,
    retry: false,
  });

  const setUser = (user: UserProfile | null) => queryClient.setQueryData(SESSION_QUERY_KEY, user);

  useEffect(
    () => onSessionExpired(() => queryClient.setQueryData(SESSION_QUERY_KEY, null)),
    [queryClient],
  );

  const signIn = useMutation({ mutationFn: authApi.signIn, onSuccess: setUser });
  const signUp = useMutation({ mutationFn: authApi.signUp, onSuccess: setUser });
  const signOut = useMutation({
    mutationFn: authApi.signOut,
    onSuccess: () => {
      queryClient.removeQueries({
        predicate: (query) => query.queryKey[0] !== SESSION_QUERY_KEY[0],
      });
      setUser(null);
    },
  });

  const status: SessionStatus = session.isPending
    ? 'loading'
    : session.data
      ? 'authenticated'
      : 'anonymous';

  const value = useMemo<SessionContextValue>(
    () => ({
      status,
      user: session.data ?? null,
      signIn: signIn.mutateAsync,
      signUp: signUp.mutateAsync,
      signOut: signOut.mutateAsync,
      isSigningOut: signOut.isPending,
    }),
    [
      status,
      session.data,
      signIn.mutateAsync,
      signUp.mutateAsync,
      signOut.mutateAsync,
      signOut.isPending,
    ],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
