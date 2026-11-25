import { BadRequestException, Logger, type ArgumentsHost } from '@nestjs/common';
import type { HttpAdapterHost } from '@nestjs/core';
import { vi } from 'vitest';
import { AllExceptionsFilter } from './all-exceptions.filter.js';

describe('AllExceptionsFilter', () => {
  const reply = vi.fn();
  const adapterHost = {
    httpAdapter: { reply, getRequestUrl: () => '/api/v1/things' },
  } as unknown as HttpAdapterHost;
  const host = {
    switchToHttp: () => ({ getRequest: () => ({ id: 'req-1' }), getResponse: () => ({}) }),
  } as unknown as ArgumentsHost;
  const filter = new AllExceptionsFilter(adapterHost);

  beforeEach(() => reply.mockReset());

  it('keeps the status and messages of expected errors', () => {
    filter.catch(new BadRequestException(['email: Enter a valid email address']), host);
    expect(reply).toHaveBeenCalledWith(
      {},
      {
        statusCode: 400,
        error: 'Bad Request',
        message: ['email: Enter a valid email address'],
        path: '/api/v1/things',
        timestamp: expect.any(String),
        requestId: 'req-1',
      },
      400,
    );
  });

  it('hides the details of unexpected errors and logs them instead', () => {
    const log = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const failure = new Error('E11000 secret internal detail');

    filter.catch(failure, host);

    const [, body, status] = reply.mock.calls[0];
    expect(status).toBe(500);
    expect(body).toMatchObject({
      statusCode: 500,
      error: 'Internal Server Error',
      message: 'Internal server error',
    });
    expect(JSON.stringify(body)).not.toContain('secret');
    expect(log).toHaveBeenCalledWith({ err: failure }, 'Unhandled exception');
    log.mockRestore();
  });
});
