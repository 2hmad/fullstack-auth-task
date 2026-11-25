import { Navigate, type RouteObject } from 'react-router';
import {
  APP_PATH,
  RedirectIfAuthenticated,
  RequireAuth,
} from '@/features/auth/guards/route-guards';
import { SignInPage } from '@/features/auth/pages/sign-in-page';
import { SignUpPage } from '@/features/auth/pages/sign-up-page';
import { WelcomePage } from '@/features/workspace/welcome-page';
import { NotFoundPage } from './not-found-page';

export const routes: RouteObject[] = [
  { index: true, element: <Navigate to={APP_PATH} replace /> },
  {
    element: <RedirectIfAuthenticated />,
    children: [
      { path: 'signin', element: <SignInPage /> },
      { path: 'signup', element: <SignUpPage /> },
    ],
  },
  {
    element: <RequireAuth />,
    children: [{ path: 'app', element: <WelcomePage /> }],
  },
  { path: '*', element: <NotFoundPage /> },
];
