import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import type { AppConfig } from '../config/config.types.js';
import { resolveRequestId } from '../common/http/request-id.js';

const PROBES = new Set(['/health', '/ready']);

/**
 * Structured logs with pino: JSON in production, readable in development, one access-log
 * line per request, and a request id on every line. Secrets are redacted.
 */
@Module({
  imports: [
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: AppConfig) => ({
        pinoHttp: {
          level: config.get('LOG_LEVEL', { infer: true }),
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
          transport:
            config.get('NODE_ENV', { infer: true }) === 'development'
              ? { target: 'pino-pretty', options: { singleLine: true, colorize: true } }
              : undefined,
        },
      }),
    }),
  ],
})
export class LoggingModule {}
