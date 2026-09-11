import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthController } from '../../src/auth/auth.controller.js';
import { AuthService } from '../../src/auth/auth.service.js';
import type { AuthenticatedRequest } from '../../src/auth/guards/supabase-auth.guard.js';

describe('AuthController', () => {
  let authController: AuthController;

  const login = vi.fn();

  beforeEach(async () => {
    vi.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        {
          provide: AuthService,
          useValue: {
            login,
          },
        },
      ],
    }).compile();

    authController = module.get<AuthController>(AuthController);
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