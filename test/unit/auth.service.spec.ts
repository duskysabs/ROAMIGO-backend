import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from '../../src/auth/auth.service.js';
import { SupabaseService } from '../../src/supabase/supabase.service.js';
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { UserProfilesService } from '../../src/user-profiles/user-profiles.service.js';

describe('AuthService', () => {
  let authService: AuthService;

  const signInWithPassword = vi.fn();
  const signOut = vi.fn();
  const getUser = vi.fn();
  const findByUserId = vi.fn();

  const mockUserProfilesService = {
    findByUserId,
  };

  const mockSupabaseService = {
    createClient: vi.fn(() => ({
      auth: {
        signInWithPassword,
        signOut,
        getUser,
      },
    })),
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: SupabaseService,
          useValue: mockSupabaseService,
        },
        {
          provide: UserProfilesService,
          useValue: mockUserProfilesService,
        },
      ],
    }).compile();

    authService = module.get<AuthService>(AuthService);
  });

  it('returns tokens and user information when login succeeds', async () => {
    // Arrange
    signInWithPassword.mockResolvedValue({
      data: {
        session: {
          access_token: 'fake-access-token',
          refresh_token: 'fake-refresh-token',
          expires_in: 3600,
          token_type: 'bearer',
        },
        user: {
          id: 'fake-user-id',
          email: 'test@example.com',
        },
      },
      error: null,
    });
    findByUserId.mockResolvedValue({
      userId: 'fake-user-id',
      accountStatus: 'ACTIVE',
    });

    // Act
    const result = await authService.login({
      email: 'test@example.com',
      password: 'test-password',
    });

    // Assert
    expect(signInWithPassword).toHaveBeenCalledWith({
      email: 'test@example.com',
      password: 'test-password',
    });
    expect(findByUserId).toHaveBeenCalledWith('fake-user-id');
    expect(signOut).not.toHaveBeenCalled();

    expect(result).toEqual({
      accessToken: 'fake-access-token',
      refreshToken: 'fake-refresh-token',
      expiresIn: 3600,
      tokenType: 'bearer',
      user: {
        id: 'fake-user-id',
        email: 'test@example.com',
      },
    });
  });

  it('throws UnauthorizedException when login fails', async () => {
    // Arrange
    signInWithPassword.mockResolvedValue({
      data: {
        session: null,
        user: null,
      },
      error: {
        message: 'Invalid login credentials',
      },
    });

    // Act and assert
    await expect(
      authService.login({
        email: 'test@example.com',
        password: 'wrong-password',
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(findByUserId).not.toHaveBeenCalled();
    expect(signOut).not.toHaveBeenCalled();
  });

  it('signs out and rejects login when the user profile is missing', async () => {
    signInWithPassword.mockResolvedValue({
      data: {
        session: {
          access_token: 'fake-access-token',
          refresh_token: 'fake-refresh-token',
        },
        user: {
          id: 'fake-user-id',
          email: 'test@example.com',
        },
      },
      error: null,
    });
    findByUserId.mockResolvedValue(null);
    signOut.mockResolvedValue({ error: null });

    await expect(
      authService.login({
        email: 'test@example.com',
        password: 'test-password',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(findByUserId).toHaveBeenCalledWith('fake-user-id');
    expect(signOut).toHaveBeenCalledOnce();
  });

  it('signs out and rejects login when the account is inactive', async () => {
    signInWithPassword.mockResolvedValue({
      data: {
        session: {
          access_token: 'fake-access-token',
          refresh_token: 'fake-refresh-token',
        },
        user: {
          id: 'fake-user-id',
          email: 'test@example.com',
        },
      },
      error: null,
    });
    findByUserId.mockResolvedValue({
      userId: 'fake-user-id',
      accountStatus: 'INACTIVE',
    });
    signOut.mockResolvedValue({ error: null });

    await expect(
      authService.login({
        email: 'test@example.com',
        password: 'test-password',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(findByUserId).toHaveBeenCalledWith('fake-user-id');
    expect(signOut).toHaveBeenCalledOnce();
  });

  it('returns user information when the access token is valid', async () => {
    // Arrange
    getUser.mockResolvedValue({
      data: {
        user: {
          id: 'fake-user-id',
          email: 'test@example.com',
        },
      },
      error: null,
    });

    const mockProfile = {
      userId: 'fake-user-id',
      firstName: 'Test',
      lastName: 'User',
      birthDate: null,
      homeAddress: null,
      role: 'CUSTOMER',
      accountStatus: 'ACTIVE',
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-01'),
    };

    findByUserId.mockResolvedValue(mockProfile);

    // Act
    const result = await authService.getUser('fake-access-token');

    // Assert
    expect(getUser).toHaveBeenCalledWith('fake-access-token');
    expect(findByUserId).toHaveBeenCalledWith('fake-user-id');

    expect(result).toEqual({
      id: 'fake-user-id',
      email: 'test@example.com',
      profile: mockProfile,
    });
  });

  it('throws UnauthorizedException when the access token is invalid', async () => {
    // Arrange
    getUser.mockResolvedValue({
      data: {
        user: null,
      },
      error: {
        message: 'Invalid JWT',
      },
    });

    // Act and assert
    await expect(
      authService.getUser('invalid-access-token'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
