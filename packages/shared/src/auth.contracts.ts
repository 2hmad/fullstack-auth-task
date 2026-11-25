/** Response shapes of the API, shared so the web client is typed against the real contract. */

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  createdAt: string;
}

export interface AuthSession {
  /** Short-lived bearer token. The refresh token travels only in an httpOnly cookie. */
  accessToken: string;
  /** Lifetime of the access token, in seconds. */
  expiresIn: number;
  user: UserProfile;
}

/** Body of every error the API returns. */
export interface ApiErrorBody {
  statusCode: number;
  error: string;
  message: string | string[];
  path: string;
  timestamp: string;
  requestId?: string;
}
