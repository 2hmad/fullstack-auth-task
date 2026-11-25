import { createParamDecorator, SetMetadata, type ExecutionContext } from '@nestjs/common';
import type { AuthenticatedRequest } from './auth.guard.js';

export const IS_PUBLIC = 'auth:public';

/** Opts a route or controller out of the global authentication guard. */
export const Public = () => SetMetadata(IS_PUBLIC, true);

/** The user the guard authenticated. Only on routes without @Public(). */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext) =>
    context.switchToHttp().getRequest<AuthenticatedRequest>().user,
);
