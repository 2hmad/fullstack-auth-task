import {
  Catch,
  HttpException,
  HttpStatus,
  Logger,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import type { ApiErrorBody } from '@auth-app/shared';
import { STATUS_CODES } from 'node:http';

interface HttpErrorResponse {
  message?: string | string[];
  error?: string;
}

/**
 * Gives every error the same body: { statusCode, error, message, path, timestamp, requestId }.
 * Expected errors (HttpException) keep their status and message. Anything else is logged with
 * its stack and answered with a generic 500, so internals never reach the client.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  constructor(private readonly adapterHost: HttpAdapterHost) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const { httpAdapter } = this.adapterHost;
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<{ id?: string | number }>();

    const statusCode =
      exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const error = STATUS_CODES[statusCode] ?? 'Error';

    let message: string | string[] = 'Internal server error';
    if (exception instanceof HttpException) {
      const response = exception.getResponse();
      message =
        typeof response === 'string'
          ? response
          : ((response as HttpErrorResponse).message ?? exception.message);
    }

    if (statusCode >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error({ err: exception }, 'Unhandled exception');
    }

    const body: ApiErrorBody = {
      statusCode,
      error,
      message,
      path: httpAdapter.getRequestUrl(ctx.getRequest()),
      timestamp: new Date().toISOString(),
      ...(request.id !== undefined && { requestId: String(request.id) }),
    };
    httpAdapter.reply(ctx.getResponse(), body, statusCode);
  }
}
