import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module.js';
import { configureApp } from './app.setup.js';
import type { AppConfig } from './config/config.types.js';

const app = await NestFactory.create(AppModule, { bufferLogs: true });
app.useLogger(app.get(Logger));
configureApp(app);

const port = app.get<AppConfig>(ConfigService).get('PORT', { infer: true });
await app.listen(port, '0.0.0.0');
app.get(Logger).log(`API listening on port ${port}`, 'Bootstrap');
