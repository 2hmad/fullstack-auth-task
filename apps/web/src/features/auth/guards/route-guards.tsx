import { Navigate, Outlet, useLocation } from 'react-router';
import { useSession } from '../use-session';
import { FullPageSpinner } from '@/components/full-page-spinner';

export const SIGN_IN_PATH = '/signin';
export const APP_PATH = '/app';

/** Only for signed-in users; everyone else goes to sign-in and comes back afterwards. */
export function RequireAuth() {
  const { status } = useSession();
  const location = useLocation();
  if (status === 'loading') return <FullPageSpinner />;
  if (status === 'anonymous') {
    return <Navigate to={SIGN_IN_PATH} replace state={{ from: location.pathname }} />;
  }
  return <Outlet />;
}

/** Sign-in and sign-up make no sense when already signed in. */
export function RedirectIfAuthenticated() {
  const { status } = useSession();
  if (status === 'loading') return <FullPageSpinner />;
  if (status === 'authenticated') return <Navigate to={APP_PATH} replace />;
  return <Outlet />;
}
