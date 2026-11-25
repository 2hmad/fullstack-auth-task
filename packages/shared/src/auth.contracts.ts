import { z } from 'zod';

/**
 * Response shapes of the API. The API documents its responses with these schemas, and the
 * web client parses responses with them, so a contract change breaks the build, not production.
 */

export const userProfileSchema = z
  .object({
    id: z.string(),
    email: z.string(),
    name: z.string(),
    createdAt: z.iso.datetime(),
  })
  .meta({ id: 'UserProfile' });

export const accessTokenSchema = z
  .object({
    /** Short-lived bearer token. The refresh token travels only in an httpOnly cookie. */
    accessToken: z.string(),
    /** Lifetime of the access token, in seconds. */
    expiresIn: z.number().int().positive(),
  })
  .meta({ id: 'AccessToken' });

export const authSessionSchema = accessTokenSchema
  .extend({ user: userProfileSchema })
  .meta({ id: 'AuthSession' });

/** Body of every error the API returns. */
export const apiErrorSchema = z
  .object({
    statusCode: z.number().int(),
    error: z.string(),
    message: z.union([z.string(), z.array(z.string())]),
    path: z.string(),
    timestamp: z.iso.datetime(),
    requestId: z.string().optional(),
  })
  .meta({ id: 'ApiError' });

export type UserProfile = z.infer<typeof userProfileSchema>;
export type AccessToken = z.infer<typeof accessTokenSchema>;
export type AuthSession = z.infer<typeof authSessionSchema>;
export type ApiErrorBody = z.infer<typeof apiErrorSchema>;
