import {
  type INestApplication,
  ForbiddenException,
  HttpStatus,
  UnauthorizedException,
  ValidationPipe,
} from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { AppModule } from '../../src/app.module.js';
import { AuthService } from '../../src/auth/auth.service.js';
import { LoginRateLimitGuard } from '../../src/auth/guards/login-rate-limit.guard.js';
import {
  AccountStatus,
  UserRole,
} from '../../src/generated/prisma/enums.js';
import { UserProfilesService } from '../../src/user-profiles/user-profiles.service.js';

describe('Authentication endpoints', () => {
  let app: INestApplication<App>;

  const signUp = vi.fn();
  const login = vi.fn();
  const getUser = vi.fn();
  const verifyAccessToken = vi.fn();
  const completeCustomerProfile = vi.fn();

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(AuthService)
      .useValue({
        signUp,
        login,
        getUser,
        verifyAccessToken,
      })
      .overrideProvider(UserProfilesService)
      .useValue({ completeCustomerProfile })
      .overrideGuard(LoginRateLimitGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = module.createNestApplication();

    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );

    await app.init();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterAll(async () => {
    await app.close();
  });

  it('POST /auth/login returns authentication information', async () => {
    const expectedResult = {
      accessToken: 'fake-access-token',
      refreshToken: 'fake-refresh-token',
      expiresIn: 3600,
      tokenType: 'bearer',
      user: {
        id: 'fake-user-id',
        email: 'test@example.com',
      },
      requiresProfile: false,
      nextStep: 'APPLICATION',
    };

    login.mockResolvedValue(expectedResult);

    await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        email: 'test@example.com',
        password: 'test-password',
      })
      .expect(HttpStatus.OK)
      .expect(expectedResult);
  });

  it('POST /auth/login rejects an invalid email', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        email: 'not-an-email',
        password: 'test-password',
      })
      .expect(HttpStatus.BAD_REQUEST);

    expect(response.body.message).toContain('email must be an email');
    expect(login).not.toHaveBeenCalled();
  });

  it('POST /auth/login returns 401 when login fails', async () => {
    login.mockRejectedValue(
      new UnauthorizedException('Invalid email or password'),
    );

    await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        email: 'test@example.com',
        password: 'wrong-password',
      })
      .expect(HttpStatus.UNAUTHORIZED);
  });

  it('POST /auth/login returns 403 when the application account is inactive', async () => {
    login.mockRejectedValue(new ForbiddenException('Account is inactive.'));

    await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        email: 'test@example.com',
        password: 'correct-password',
      })
      .expect(HttpStatus.FORBIDDEN);
  });

  it('POST /auth/login sends a user without a profile back to registration', async () => {
    const expectedResult = {
      accessToken: 'fake-access-token',
      refreshToken: 'fake-refresh-token',
      expiresIn: 3600,
      tokenType: 'bearer',
      user: {
        id: 'fake-user-id',
        email: 'test@example.com',
      },
      requiresProfile: true,
      nextStep: 'COMPLETE_PROFILE',
    };

    login.mockResolvedValue(expectedResult);

    await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        email: 'test@example.com',
        password: 'correct-password',
      })
      .expect(HttpStatus.OK)
      .expect(expectedResult);
  });

  it('resumes registration after a user signs up and leaves onboarding', async () => {
    const onboardingAuth = {
      accessToken: 'onboarding-access-token',
      refreshToken: 'onboarding-refresh-token',
      expiresIn: 3600,
      tokenType: 'bearer',
      user: {
        id: 'new-customer-id',
        email: 'customer@example.com',
      },
      requiresProfile: true,
      nextStep: 'COMPLETE_PROFILE',
    };

    signUp.mockResolvedValue({
      ...onboardingAuth,
      requiresEmailConfirmation: false,
    });
    login.mockResolvedValue(onboardingAuth);
    verifyAccessToken.mockResolvedValue(onboardingAuth.user);
    completeCustomerProfile.mockResolvedValue({
      userId: 'new-customer-id',
      role: UserRole.CUSTOMER,
      accountStatus: AccountStatus.ACTIVE,
    });

    await request(app.getHttpServer())
      .post('/auth/signup')
      .send({
        email: 'customer@example.com',
        password: 'secure-password',
      })
      .expect(HttpStatus.CREATED)
      .expect({
        ...onboardingAuth,
        requiresEmailConfirmation: false,
      });

    // Leaving onboarding creates no application profile. The next login must
    // still return COMPLETE_PROFILE instead of entering the application.
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        email: 'customer@example.com',
        password: 'secure-password',
      })
      .expect(HttpStatus.OK)
      .expect(onboardingAuth);

    await request(app.getHttpServer())
      .post('/user-profiles/me/complete')
      .set('Authorization', 'Bearer onboarding-access-token')
      .send({
        firstName: 'New',
        lastName: 'Customer',
        phoneNumber: '+639171234567',
      })
      .expect(HttpStatus.CREATED)
      .expect({
        userId: 'new-customer-id',
        role: UserRole.CUSTOMER,
        accountStatus: AccountStatus.ACTIVE,
      });

    expect(completeCustomerProfile).toHaveBeenCalledWith('new-customer-id', {
      firstName: 'New',
      lastName: 'Customer',
      phoneNumber: '+639171234567',
    });
  });

  it('GET /auth/me rejects a request without a token', async () => {
    await request(app.getHttpServer())
      .get('/auth/me')
      .expect(HttpStatus.UNAUTHORIZED);

    expect(getUser).not.toHaveBeenCalled();
  });

  it('GET /auth/me returns the authenticated user', async () => {
    const user = {
      id: 'fake-user-id',
      email: 'test@example.com',
    };

    getUser.mockResolvedValue(user);

    await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', 'Bearer fake-access-token')
      .expect(HttpStatus.OK)
      .expect({ user });

    expect(getUser).toHaveBeenCalledWith('fake-access-token');
  });
});
