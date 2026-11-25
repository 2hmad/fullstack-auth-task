import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';

export const REQUEST_ID_HEADER = 'x-request-id';
/** Accept a caller's id only if it is short and harmless to log. */
const SAFE_REQUEST_ID = /^[\w.-]{1,128}$/;

/** Reuses a well-formed incoming X-Request-Id (to join a caller's trace) or makes one, and echoes it back. */
export function resolveRequestId(req: IncomingMessage, res: ServerResponse): string {
  const incoming = req.headers[REQUEST_ID_HEADER];
  const id =
    typeof incoming === 'string' && SAFE_REQUEST_ID.test(incoming) ? incoming : randomUUID();
  res.setHeader(REQUEST_ID_HEADER, id);
  return id;
}
