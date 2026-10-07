import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthController } from '../../src/auth/auth.controller.js';
import { AuthService } from '../../src/auth/auth.service.js';
import { LoginRateLimitGuard } from '../../src/auth/guards/login-rate-limit.guard.js';
import type { AuthenticatedRequest } from '../../src/auth/guards/supabase-auth.guard.js';

describe('AuthController', () => {
  let authController: AuthController;

  const signUp = vi.fn();
  const login = vi.fn();

  beforeEach(async () => {
    vi.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        {
          provide: AuthService,
          useValue: {
            signUp,
            login,
          },
        },
      ],
    })
      .overrideGuard(LoginRateLimitGuard)
      .useValue({ canActivate: () => true })
      .compile();

    authController = module.get<AuthController>(AuthController);
  });

  it('forwards signup data to AuthService', async () => {
    const signUpDto = {
      email: 'test@example.com',
      password: 'test-password',
    };
    const expectedResult = {
      requiresProfile: true,
      nextStep: 'COMPLETE_PROFILE',
    };
    signUp.mockResolvedValue(expectedResult);

    await expect(authController.signUp(signUpDto)).resolves.toEqual(
      expectedResult,
    );
    expect(signUp).toHaveBeenCalledWith(signUpDto);
  });

  it('forwards login data to AuthService', async () => {
    // Arrange
    const loginDto = {
      email: 'test@example.com',
      password: 'test-password',
    };

    const expectedResult = {
      accessToken: 'fake-access-token',
      refreshToken: 'fake-refresh-token',
      expiresIn: 3600,
      tokenType: 'bearer',
      user: {
        id: 'fake-user-id',
        email: 'test@example.com',
      },
    };

    login.mockResolvedValue(expectedResult);

    // Act
    const result = await authController.login(loginDto);

    // Assert
    expect(login).toHaveBeenCalledWith(loginDto);
    expect(result).toEqual(expectedResult);
  });

  it('returns the user attached to the authenticated request', () => {
    // Arrange
    const request = {
      user: {
        id: 'fake-user-id',
        email: 'test@example.com',
      },
    } as unknown as AuthenticatedRequest;

    // Act
    const result = authController.getCurrentUser(request);

    // Assert
    expect(result).toEqual({
      user: {
        id: 'fake-user-id',
        email: 'test@example.com',
      },
    });
  });
});
