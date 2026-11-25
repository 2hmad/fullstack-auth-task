import type { Options } from 'pino-http';
import { resolveRequestId } from '../common/http/request-id.js';

const PROBES = new Set(['/health', '/ready']);

/** What is logged about a request, kept apart from the module so a test can check what is not. */
export function httpLoggerOptions(level: string): Options {
  return {
    level,
    genReqId: resolveRequestId,
    autoLogging: { ignore: (req) => PROBES.has(req.url ?? '') },
    // Keep lines short: no headers (they hold cookies and tokens anyway), just what helps debugging.
    serializers: {
      req: (req: { id: string; method: string; url: string; remoteAddress?: string }) => ({
        id: req.id,
        method: req.method,
        url: req.url,
        remoteAddress: req.remoteAddress,
      }),
      res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
    },
    // A second line of defence, should a log call ever include one of these.
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        'res.headers["set-cookie"]',
        '*.password',
        '*.passwordHash',
        '*.accessToken',
        '*.refreshToken',
      ],
      censor: '[REDACTED]',
    },
  };
}
