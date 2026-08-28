import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { loadConfig } from '@supportops/config';
import { prisma } from '@supportops/db';
import type { NotificationProducer } from '@supportops/queue';
import { AppModule } from '../src/app.module.js';
import { DomainExceptionFilter } from '../src/common/domain-exception.filter.js';

export interface TestContext {
  app: INestApplication;
  prisma: typeof prisma;
}

/** Keeps the integration suite off Redis: notifications persist but never enqueue. */
const nullProducer: NotificationProducer = {
  add: async () => {},
  close: async () => {},
};

/** Build the full Nest app with the same global pipes/filters as production. */
export async function buildTestApp(): Promise<TestContext> {
  const config = loadConfig();
  const app = await NestFactory.create(AppModule.register(config, { producer: nullProducer }), {
    logger: false,
  });
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  app.useGlobalFilters(new DomainExceptionFilter());
  await app.init();
  return { app, prisma };
}
