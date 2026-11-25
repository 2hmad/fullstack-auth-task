import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { Writable } from 'node:stream';
import { pinoHttp } from 'pino-http';
import request from 'supertest';
import { httpLoggerOptions } from './http-logger.options.js';

describe('HTTP logging', () => {
  const capture = () => {
    const lines: string[] = [];
    const stream = new Writable({
      write(chunk: Buffer, _encoding, done) {
        lines.push(chunk.toString());
        done();
      },
    });
    const middleware = pinoHttp(httpLoggerOptions('info'), stream);
    const server = createServer((req: IncomingMessage, res: ServerResponse) => {
      middleware(req, res);
      req.log.info({ body: { email: 'ada@example.com', password: 'secret-password' } }, 'careless');
      res.setHeader('Set-Cookie', 'refresh_token=secret-set-cookie');
      res.end('{}');
    });
    return { lines, server };
  };

  it('logs the request without credentials, cookies or tokens', async () => {
    const { lines, server } = capture();
    await request(server)
      .post('/api/v1/auth/signin')
      .set('Authorization', 'Bearer secret-token')
      .set('Cookie', 'refresh_token=secret-cookie')
      .send({ password: 'secret-password' });

    const output = lines.join('');
    expect(output).toContain('"url":"/api/v1/auth/signin"');
    expect(output).toContain('"statusCode":200');
    expect(output).toContain('[REDACTED]');
    expect(output).not.toContain('secret-');
  });

  it('does not log health probes', async () => {
    const { lines, server } = capture();
    await request(server).get('/health');
    expect(lines.join('')).not.toContain('request completed');
  });
});
