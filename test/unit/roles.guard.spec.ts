import {
  type ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UserRole } from '../../src/generated/prisma/enums.js';
import { RolesGuard } from '../../src/auth/guards/roles.guard.js';

type TestRequest = {
  user?: {
    id: string;
    email?: string;
    profile?: {
      role?: UserRole;
    };
  };
};

function createContext(request: TestRequest): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
    getHandler: () => vi.fn(),
    getClass: () => class TestController {},
  } as unknown as ExecutionContext;
}

describe('RolesGuard', () => {
  const getAllAndOverride = vi.fn();
  let guard: RolesGuard;

  beforeEach(() => {
    vi.clearAllMocks();
    guard = new RolesGuard({ getAllAndOverride } as unknown as Reflector);
  });

  it('allows routes that do not require roles', () => {
    getAllAndOverride.mockReturnValue(undefined);

    expect(guard.canActivate(createContext({}))).toBe(true);
  });

  it('allows a user with a required role', () => {
    getAllAndOverride.mockReturnValue([UserRole.ADMIN]);
    const request: TestRequest = {
      user: {
        id: 'admin-id',
        profile: { role: UserRole.ADMIN },
      },
    };

    expect(guard.canActivate(createContext(request))).toBe(true);
  });

  it.each([UserRole.CUSTOMER, UserRole.STAFF, UserRole.DRIVER])(
    'rejects a user with the disallowed %s role',
    (role) => {
      getAllAndOverride.mockReturnValue([UserRole.ADMIN]);
      const request: TestRequest = {
        user: {
          id: 'non-admin-id',
          profile: { role },
        },
      };

      expect(() => guard.canActivate(createContext(request))).toThrow(
        ForbiddenException,
      );
    },
  );

  it('rejects a role-protected route when authentication was not established', () => {
    getAllAndOverride.mockReturnValue([UserRole.ADMIN]);

    expect(() => guard.canActivate(createContext({}))).toThrow(
      UnauthorizedException,
    );
  });

  it('rejects an authenticated user without a profile role', () => {
    getAllAndOverride.mockReturnValue([UserRole.ADMIN]);
    const request: TestRequest = {
      user: {
        id: 'user-without-profile-role',
        profile: {},
      },
    };

    expect(() => guard.canActivate(createContext(request))).toThrow(
      ForbiddenException,
    );
  });
});
