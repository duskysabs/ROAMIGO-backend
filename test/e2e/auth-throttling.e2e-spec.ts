import {
  type INestApplication,
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
import { LOGIN_RATE_LIMIT } from '../../src/auth/constants/auth-rate-limit.constants.js';

describe('Authentication rate limiting', () => {
  let app: INestApplication<App>;

  const login = vi.fn();
  const getUser = vi.fn();

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(AuthService)
      .useValue({ login, getUser })
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
    login.mockRejectedValue(
      new UnauthorizedException('Invalid email or password'),
    );
  });

  afterAll(async () => {
    await app.close();
  });

  it('allows the configured number of login attempts and then returns 429', async () => {
    for (let attempt = 0; attempt < LOGIN_RATE_LIMIT; attempt += 1) {
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: 'rate-limit-test@example.com',
          password: 'wrong-password',
        })
        .expect(HttpStatus.UNAUTHORIZED);
    }

    const throttledResponse = await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        email: 'rate-limit-test@example.com',
        password: 'wrong-password',
      })
      .expect(HttpStatus.TOO_MANY_REQUESTS);

    expect(login).toHaveBeenCalledTimes(LOGIN_RATE_LIMIT);
    expect(throttledResponse.headers['retry-after']).toBeDefined();
  });

  it('does not apply the strict login limit to unrelated routes', async () => {
    for (
      let requestNumber = 0;
      requestNumber <= LOGIN_RATE_LIMIT;
      requestNumber += 1
    ) {
      await request(app.getHttpServer()).get('/').expect(HttpStatus.OK);
    }
  });
});
