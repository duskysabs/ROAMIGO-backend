import {
  type INestApplication,
  HttpStatus,
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
import { UserRole } from '../../src/generated/prisma/enums.js';
import { UserProfilesService } from '../../src/user-profiles/user-profiles.service.js';

describe('User profile authorization', () => {
  let app: INestApplication<App>;

  const getUser = vi.fn();
  const findAll = vi.fn();

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(AuthService)
      .useValue({ getUser })
      .overrideProvider(UserProfilesService)
      .useValue({ findAll })
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

  it('rejects an unauthenticated request', async () => {
    await request(app.getHttpServer())
      .get('/user-profiles')
      .expect(HttpStatus.UNAUTHORIZED);

    expect(getUser).not.toHaveBeenCalled();
    expect(findAll).not.toHaveBeenCalled();
  });

  it('allows an administrator to list profiles', async () => {
    const profiles = [{ userId: 'customer-id' }];
    getUser.mockResolvedValue({
      id: 'admin-id',
      email: 'admin@example.com',
      profile: { role: UserRole.ADMIN },
    });
    findAll.mockResolvedValue(profiles);

    await request(app.getHttpServer())
      .get('/user-profiles')
      .set('Authorization', 'Bearer admin-token')
      .expect(HttpStatus.OK)
      .expect(profiles);

    expect(getUser).toHaveBeenCalledWith('admin-token');
    expect(findAll).toHaveBeenCalledOnce();
  });

  it.each([UserRole.CUSTOMER, UserRole.STAFF, UserRole.DRIVER])(
    'rejects the %s role',
    async (role) => {
      getUser.mockResolvedValue({
        id: 'non-admin-id',
        email: 'user@example.com',
        profile: { role },
      });

      await request(app.getHttpServer())
        .get('/user-profiles')
        .set('Authorization', `Bearer ${role.toLowerCase()}-token`)
        .expect(HttpStatus.FORBIDDEN);

      expect(findAll).not.toHaveBeenCalled();
    },
  );

  it('rejects authenticated context without a profile role', async () => {
    getUser.mockResolvedValue({
      id: 'malformed-user-id',
      email: 'user@example.com',
      profile: {},
    });

    await request(app.getHttpServer())
      .get('/user-profiles')
      .set('Authorization', 'Bearer malformed-user-token')
      .expect(HttpStatus.FORBIDDEN);

    expect(findAll).not.toHaveBeenCalled();
  });
});
