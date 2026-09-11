import {
  type INestApplication,
  HttpStatus,
  UnauthorizedException,
  ValidationPipe,
} from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../../src/app.module.js';
import { AuthService } from '../../src/auth/auth.service.js';

describe('Authentication endpoints', () => {
  let app: INestApplication<App>;

  const login = vi.fn();
  const getUser = vi.fn();

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(AuthService)
      .useValue({
        login,
        getUser,
      })
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