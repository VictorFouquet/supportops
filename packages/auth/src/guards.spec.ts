import { describe, it, expect } from 'vitest';
import { UnauthorizedException, ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { JwtAuthGuard } from './jwt-auth.guard.js';
import { RolesGuard } from './roles.guard.js';
import { Roles } from './decorators.js';
import type { AuthPrincipal } from './tokens.js';

function contextFor(request: unknown, handler: () => void = () => {}): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => handler,
    getClass: () => class {},
  } as unknown as ExecutionContext;
}

describe('JwtAuthGuard', () => {
  const jwt = new JwtService({
    secret: 'test-secret-at-least-16',
    signOptions: { expiresIn: '1h' },
  });
  const guard = new JwtAuthGuard(jwt);

  it('attaches a principal for a valid bearer token', async () => {
    const token = await jwt.signAsync({ sub: 'u1', org: 'o1', role: 'AGENT' });
    const request: { headers: Record<string, string>; principal?: AuthPrincipal } = {
      headers: { authorization: `Bearer ${token}` },
    };
    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
    expect(request.principal).toEqual({ userId: 'u1', orgId: 'o1', role: 'AGENT' });
  });

  it('rejects a missing token', async () => {
    await expect(guard.canActivate(contextFor({ headers: {} }))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects a malformed token', async () => {
    await expect(
      guard.canActivate(contextFor({ headers: { authorization: 'Bearer garbage' } })),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});

describe('RolesGuard', () => {
  const guard = new RolesGuard(new Reflector());

  // A handler carrying @Roles('ADMIN') metadata.
  class Probe {
    @Roles('ADMIN')
    handler() {}
  }
  const adminHandler = Object.getOwnPropertyDescriptor(Probe.prototype, 'handler')!.value;

  it('allows a principal whose role is permitted', () => {
    const request = { principal: { userId: 'u', orgId: 'o', role: 'ADMIN' } };
    expect(guard.canActivate(contextFor(request, adminHandler))).toBe(true);
  });

  it('forbids a principal whose role is not permitted', () => {
    const request = { principal: { userId: 'u', orgId: 'o', role: 'AGENT' } };
    expect(() => guard.canActivate(contextFor(request, adminHandler))).toThrow(ForbiddenException);
  });

  it('allows any request when no roles are required', () => {
    expect(guard.canActivate(contextFor({ principal: undefined }))).toBe(true);
  });
});
