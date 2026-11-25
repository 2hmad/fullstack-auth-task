import { Navigate, Outlet, useLocation } from 'react-router';
import { ServerUnavailablePage } from '../pages/server-unavailable-page';
import { useSession } from '../use-session';
import { FullPageSpinner } from '@/components/full-page-spinner';
import { safeReturnPath } from './return-path';

export const SIGN_IN_PATH = '/signin';
export const APP_PATH = '/app';

/** Only for signed-in users; everyone else goes to sign-in and comes back afterwards. */
export function RequireAuth() {
  const { status } = useSession();
  const location = useLocation();
  if (status === 'loading') return <FullPageSpinner />;
  if (status === 'unavailable') return <ServerUnavailablePage />;
  if (status === 'anonymous') {
    return <Navigate to={SIGN_IN_PATH} replace state={{ from: location.pathname }} />;
  }
  return <Outlet />;
}

/**
 * Sign-in and sign-up make no sense when already signed in: go to the page that asked for
 * sign-in, or to the application. This also performs the redirect right after signing in.
 */
export function RedirectIfAuthenticated() {
  const { status } = useSession();
  const location = useLocation();
  if (status === 'loading') return <FullPageSpinner />;
  if (status === 'authenticated') {
    return <Navigate to={safeReturnPath(location.state) ?? APP_PATH} replace />;
  }
  return <Outlet />;
}
