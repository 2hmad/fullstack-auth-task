import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

export const DOCS_PATH = 'api/docs';

/** Swagger UI at /api/docs, JSON at /api/docs-json. Request schemas come from the shared Zod schemas. */
export function setupSwagger(app: INestApplication): void {
  const config = new DocumentBuilder()
    .setTitle('Auth App API')
    .setDescription(
      'Sign up, sign in and session management. Access tokens are bearer JWTs; the refresh ' +
        'token lives in an httpOnly `refresh_token` cookie scoped to `/api/v1/auth`.',
    )
    .setVersion('1.0')
    .addBearerAuth()
    .addCookieAuth('refresh_token')
    .build();
  SwaggerModule.setup(DOCS_PATH, app, () => SwaggerModule.createDocument(app, config));
}
