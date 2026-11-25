import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import type { AppConfig } from '../config/config.types.js';
import { httpLoggerOptions } from './http-logger.options.js';

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
          ...httpLoggerOptions(config.get('LOG_LEVEL', { infer: true })),
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
