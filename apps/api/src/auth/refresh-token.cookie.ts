import type { CookieOptions, Request, Response } from 'express';

export const REFRESH_COOKIE_NAME = 'refresh_token';
/** The browser sends the cookie to the auth endpoints only, never to the rest of the API. */
export const REFRESH_COOKIE_PATH = '/api/v1/auth';

export interface RefreshCookieSettings {
  secure: boolean;
  maxAgeSeconds: number;
}

function baseOptions(settings: RefreshCookieSettings): CookieOptions {
  return {
    httpOnly: true, // unreachable from JavaScript, so XSS cannot read it
    secure: settings.secure,
    sameSite: 'strict', // never sent on cross-site requests
    path: REFRESH_COOKIE_PATH,
  };
}

export function setRefreshCookie(
  res: Response,
  token: string,
  settings: RefreshCookieSettings,
): void {
  res.cookie(REFRESH_COOKIE_NAME, token, {
    ...baseOptions(settings),
    maxAge: settings.maxAgeSeconds * 1000,
  });
}

export function clearRefreshCookie(res: Response, settings: RefreshCookieSettings): void {
  res.clearCookie(REFRESH_COOKIE_NAME, baseOptions(settings));
}

export function readRefreshCookie(req: Request): string | undefined {
  const value: unknown = req.cookies?.[REFRESH_COOKIE_NAME];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}
