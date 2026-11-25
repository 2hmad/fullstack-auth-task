import { accessTokenSchema } from '@auth-app/shared';
import type { z } from 'zod';
import { accessTokenStore } from './access-token';
import { ApiError } from './api-error';

export const API_BASE = '/api/v1';
const REFRESH_PATH = `${API_BASE}/auth/refresh`;
const REFRESH_LOCK = 'auth-refresh';

type SessionExpiredListener = () => void;
const sessionExpiredListeners = new Set<SessionExpiredListener>();

/** Called when a signed-in request fails and the session cannot be renewed. */
export function onSessionExpired(listener: SessionExpiredListener): () => void {
  sessionExpiredListeners.add(listener);
  return () => sessionExpiredListeners.delete(listener);
}

async function send(path: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(path, { credentials: 'same-origin', ...init });
  } catch (cause) {
    throw ApiError.network(cause);
  }
}

/**
 * Refresh tokens are single use, and reusing one revokes the session. Two tabs refreshing
 * with the same cookie would log the user out, so refreshes are serialised across tabs with
 * the Web Locks API: the second tab waits, then sends the cookie the first one received.
 */
function withRefreshLock<T>(task: () => Promise<T>): Promise<T> {
  return typeof navigator !== 'undefined' && navigator.locks
    ? navigator.locks.request(REFRESH_LOCK, task)
    : task();
}

let inFlightRefresh: Promise<string | null> | null = null;

/**
 * Exchanges the refresh cookie for a new access token. Concurrent callers in this tab share
 * one request. Resolves null when there is no valid session.
 */
export function refreshAccessToken(): Promise<string | null> {
  inFlightRefresh ??= withRefreshLock(async () => {
    const response = await send(REFRESH_PATH, { method: 'POST' });
    if (!response.ok) {
      accessTokenStore.clear();
      if (response.status === 401) return null;
      throw await ApiError.fromResponse(response);
    }
    const { accessToken } = accessTokenSchema.parse(await response.json());
    accessTokenStore.set(accessToken);
    return accessToken;
  }).finally(() => {
    inFlightRefresh = null;
  });
  return inFlightRefresh;
}

interface RequestOptions<T> {
  method?: 'GET' | 'POST';
  body?: unknown;
  /** Parses the response body; responses are untrusted input too. */
  schema?: z.ZodType<T>;
  /**
   * Whether this call acts as the signed-in user (default). Credential endpoints set it to
   * false: their 401 means "wrong password", not "token expired", so no refresh is attempted.
   */
  authenticated?: boolean;
}

/**
 * JSON request to the API. Sends the access token when there is one; on a 401 it refreshes
 * once and retries, and reports an expired session if that fails.
 */
export async function apiRequest<T = void>(
  path: string,
  options: RequestOptions<T> = {},
): Promise<T> {
  const { method = 'GET', body, schema, authenticated = true } = options;

  const attempt = () => {
    const headers = new Headers({ Accept: 'application/json' });
    if (body !== undefined) headers.set('Content-Type', 'application/json');
    const token = authenticated ? accessTokenStore.get() : null;
    if (token) headers.set('Authorization', `Bearer ${token}`);
    return send(`${API_BASE}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  };

  let response = await attempt();
  if (response.status === 401 && authenticated && accessTokenStore.get()) {
    const renewed = await refreshAccessToken();
    if (renewed) {
      response = await attempt();
    } else {
      sessionExpiredListeners.forEach((listener) => listener());
    }
  }

  if (!response.ok) throw await ApiError.fromResponse(response);
  if (!schema || response.status === 204) return undefined as T;
  return schema.parse(await response.json());
}
