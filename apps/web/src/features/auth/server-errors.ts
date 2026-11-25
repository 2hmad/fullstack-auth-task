import { ApiError } from '@/lib/api/api-error';

/** What to tell the person when a sign-in or sign-up request fails, in plain words. */
export function describeAuthError(error: unknown, fallback: string): string {
  if (!(error instanceof ApiError)) return fallback;
  switch (error.status) {
    case 0:
      return error.message;
    case 429:
      return 'Too many attempts. Wait a minute, then try again.';
    case 400:
    case 401:
    case 409:
      return error.messages.join(' ');
    default:
      return 'Something went wrong on our side. Try again in a moment.';
  }
}
