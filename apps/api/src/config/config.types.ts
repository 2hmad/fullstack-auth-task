import type { ConfigService } from '@nestjs/config';
import type { Env } from './env.schema.js';

/** ConfigService typed with the validated environment: `config.get('PORT', { infer: true })` is a number. */
export type AppConfig = ConfigService<Env, true>;
