import {
  type ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from '../../src/auth/auth.service.js';
import { SupabaseAuthGuard } from '../../src/auth/guards/supabase-auth.guard.js';

type TestRequest = {
  headers: {
    authorization?: string;
  };
  user?: {
    id: string;
    email?: string;
  };
};

function createContext(request: TestRequest): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as unknown as ExecutionContext;
}

describe('SupabaseAuthGuard', () => {
  let guard: SupabaseAuthGuard;

  const getUser = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    guard = new SupabaseAuthGuard({
      getUser,
    } as unknown as AuthService);
  });

  it('rejects a request without an Authorization header', async () => {
    const request: TestRequest = {
      headers: {},
    };

    await expect(
      guard.canActivate(createContext(request)),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(getUser).not.toHaveBeenCalled();
  });

  it('rejects a request that does not use Bearer authentication', async () => {
    const request: TestRequest = {
      headers: {
        authorization: 'Basic abc123',
      },
    };

    await expect(
      guard.canActivate(createContext(request)),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(getUser).not.toHaveBeenCalled();
  });

  it('allows a request with a valid access token', async () => {
    const request: TestRequest = {
      headers: {
        authorization: 'Bearer valid-access-token',
      },
    };

    getUser.mockResolvedValue({
      id: 'fake-user-id',
      email: 'test@example.com',
    });

    const result = await guard.canActivate(createContext(request));

    expect(result).toBe(true);
    expect(getUser).toHaveBeenCalledWith('valid-access-token');
    expect(request.user).toEqual({
      id: 'fake-user-id',
      email: 'test@example.com',
    });
  });

  it('rejects a request with an invalid access token', async () => {
    const request: TestRequest = {
      headers: {
        authorization: 'Bearer invalid-access-token',
      },
    };

    getUser.mockRejectedValue(
      new UnauthorizedException('Invalid or expired access token'),
    );

    await expect(
      guard.canActivate(createContext(request)),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(getUser).toHaveBeenCalledWith('invalid-access-token');
  });
});