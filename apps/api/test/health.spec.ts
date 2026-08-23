import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { buildTestApp } from './app.js';

let app: INestApplication;

beforeAll(async () => {
  ({ app } = await buildTestApp());
});
afterAll(async () => {
  await app.close();
});

describe('GET /health', () => {
  it('reports liveness without auth', async () => {
    const res = await request(app.getHttpServer()).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});
