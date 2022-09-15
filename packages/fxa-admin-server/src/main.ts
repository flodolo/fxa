/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
import { NestApplicationOptions } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { SentryInterceptor } from 'fxa-shared/nestjs/sentry/sentry.interceptor';
import { init as initTracing } from 'fxa-shared/tracing/node-tracing';
import mozLog from 'mozlog';
import helmet from 'helmet';

import { AppModule } from './app.module';
import Config, { AppConfig } from './config';

async function bootstrap() {
  // Initialize tracing first
  initTracing(
    Config.getProperties().tracing,
    mozLog(Config.getProperties().log)(Config.getProperties().log.app)
  );

  const nestConfig: NestApplicationOptions = {};
  if (Config.getProperties().env !== 'development') {
    nestConfig.logger = false;
  }
  const app = await NestFactory.create<NestExpressApplication>(
    AppModule,
    nestConfig
  );
  const config: ConfigService<AppConfig> = app.get(ConfigService);
  const port = config.get('port') as number;

  if (config.get<boolean>('hstsEnabled')) {
    const maxAge = config.get<number>('hstsMaxAge');
    app.use(helmet.hsts({ includeSubDomains: true, maxAge }));
  }

  // We run behind a proxy when deployed, include the express middleware
  // to extract the X-Forwarded-For header.
  if (Config.getProperties().env !== 'development') {
    app.set('trust proxy', true);
  }

  // Add sentry as error reporter
  app.useGlobalInterceptors(new SentryInterceptor());

  // Starts listening for shutdown hooks
  app.enableShutdownHooks();

  await app.listen(port);
}
bootstrap();
