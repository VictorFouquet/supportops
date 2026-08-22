import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { loadConfig } from '@supportops/config';
import { prisma } from '@supportops/db';
import { AppModule } from '../src/app.module.js';

export interface TestContext {
  app: INestApplication;
  prisma: typeof prisma;
}

/** Build the full Nest app with the same global pipes/filters as production. */
export async function buildTestApp(): Promise<TestContext> {
  const config = loadConfig();
  const app = await NestFactory.create(AppModule.register(config), { logger: false });
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  await app.init();
  return { app, prisma };
}
