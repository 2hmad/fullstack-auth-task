import { SetMetadata } from '@nestjs/common';

export const CREDENTIALS_THROTTLE = 'rate-limit:credentials';

/** Puts a route under the strict per-IP limit for password guessing (sign-in, sign-up). */
export const CredentialsThrottle = () => SetMetadata(CREDENTIALS_THROTTLE, true);
