import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import type { AppConfig } from './config/config.types.js';
import { setupSwagger } from './docs/swagger.js';

export const API_PREFIX = 'api/v1';

/**
 * Everything main.ts applies to the app, in one place so e2e tests run the exact same setup.
 * (Pipes and filters are APP_PIPE/APP_FILTER providers in AppModule for the same reason.)
 */
export function configureApp(app: INestApplication): void {
  const config = app.get<AppConfig>(ConfigService);
  const webOrigin = config.get('WEB_ORIGIN', { infer: true });
  const express = app as NestExpressApplication;

  express.set('trust proxy', config.get('TRUST_PROXY_HOPS', { infer: true }));
  express.disable('x-powered-by');

  app.setGlobalPrefix(API_PREFIX, { exclude: ['health', 'ready'] });
  app.use(helmet());
  app.use(cookieParser());
  // Same-origin in practice (Vite proxy / nginx); CORS only matters if the web app is hosted elsewhere.
  app.enableCors({ origin: webOrigin, credentials: true });
  // Rejects cross-site state-changing requests using Fetch Metadata, on top of SameSite=Strict.
  app.enableCsrfProtection({ trustedOrigins: [webOrigin] });
  app.enableShutdownHooks();

  if (config.get('SWAGGER_ENABLED', { infer: true })) {
    setupSwagger(app);
  }
}
