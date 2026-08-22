import { describe, it, expect, vi } from 'vitest';
import type { ArgumentsHost } from '@nestjs/common';
import { DomainExceptionFilter } from './domain-exception.filter.js';
import {
  NotFoundError,
  ConflictError,
  ForbiddenActionError,
  InvalidCredentialsError,
} from './domain-errors.js';

function hostFor() {
  const res = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() };
  const host = { switchToHttp: () => ({ getResponse: () => res }) } as unknown as ArgumentsHost;
  return { res, host };
}

describe('DomainExceptionFilter', () => {
  const filter = new DomainExceptionFilter();

  it.each([
    [new NotFoundError('nope'), 404],
    [new ConflictError('dup'), 409],
    [new ForbiddenActionError('no'), 403],
    [new InvalidCredentialsError(), 401],
  ])('maps %s to status %i', (error, status) => {
    const { res, host } = hostFor();
    filter.catch(error, host);
    expect(res.status).toHaveBeenCalledWith(status);
  });

  it('maps an unknown error to 500 without leaking its message', () => {
    const { res, host } = hostFor();
    filter.catch(new Error('boom'), host);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ statusCode: 500, message: 'Internal server error' });
  });
});
