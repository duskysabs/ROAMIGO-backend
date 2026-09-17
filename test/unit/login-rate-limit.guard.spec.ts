import {
  type ExecutionContext,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  LOGIN_RATE_LIMIT,
  LOGIN_RATE_TTL_MS,
} from '../../src/auth/constants/auth-rate-limit.constants.js';
import { LoginRateLimitGuard } from '../../src/auth/guards/login-rate-limit.guard.js';

function createContext(ip: string, setHeader = vi.fn()): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        ip,
        socket: { remoteAddress: ip },
      }),
      getResponse: () => ({ setHeader }),
    }),
  } as unknown as ExecutionContext;
}

describe('LoginRateLimitGuard', () => {
  let guard: LoginRateLimitGuard;

  beforeEach(() => {
    vi.restoreAllMocks();
    guard = new LoginRateLimitGuard();
  });

  it('allows the configured attempts and rejects the next request', () => {
    const setHeader = vi.fn();
    const context = createContext('127.0.0.1', setHeader);

    for (let attempt = 0; attempt < LOGIN_RATE_LIMIT; attempt += 1) {
      expect(guard.canActivate(context)).toBe(true);
    }

    try {
      guard.canActivate(context);
      throw new Error('Expected the request to be rate limited');
    } catch (error) {
      expect(error).toBeInstanceOf(HttpException);
      expect((error as HttpException).getStatus()).toBe(
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    expect(setHeader).toHaveBeenCalledWith('Retry-After', 60);
  });

  it('tracks different client IP addresses independently', () => {
    const firstClient = createContext('127.0.0.1');
    const secondClient = createContext('127.0.0.2');

    for (let attempt = 0; attempt < LOGIN_RATE_LIMIT; attempt += 1) {
      expect(guard.canActivate(firstClient)).toBe(true);
    }

    expect(guard.canActivate(secondClient)).toBe(true);
  });

  it('starts a new attempt window after the previous window expires', () => {
    let now = 1_000_000;
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    const context = createContext('127.0.0.1');

    for (let attempt = 0; attempt < LOGIN_RATE_LIMIT; attempt += 1) {
      expect(guard.canActivate(context)).toBe(true);
    }

    now += LOGIN_RATE_TTL_MS;

    expect(guard.canActivate(context)).toBe(true);
  });
});
