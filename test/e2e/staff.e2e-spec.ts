import {
  type INestApplication,
  HttpStatus,
  ValidationPipe,
} from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../../src/app.module.js';
import { AuthService } from '../../src/auth/auth.service.js';
import {
  EmploymentStatus,
  UserRole,
} from '../../src/generated/prisma/enums.js';
import { StaffService } from '../../src/staff/staff.service.js';

const staffId = '00000000-0000-4000-8000-000000000001';
const userId = '00000000-0000-4000-8000-000000000002';

describe('Staff Administration HTTP authorization and validation', () => {
  let app: INestApplication<App>;

  const getUser = vi.fn();
  const create = vi.fn();
  const list = vi.fn();
  const detail = vi.fn();
  const updateProfile = vi.fn();
  const updateEmploymentStatus = vi.fn();

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(AuthService)
      .useValue({ getUser })
      .overrideProvider(StaffService)
      .useValue({
        create,
        list,
        detail,
        updateProfile,
        updateEmploymentStatus,
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

  it('rejects unauthenticated Staff administration access', async () => {
    await request(app.getHttpServer())
      .get('/admin/staff')
      .expect(HttpStatus.UNAUTHORIZED);
    expect(list).not.toHaveBeenCalled();
  });

  it('rejects a non-Administrator role', async () => {
    getUser.mockResolvedValue({
      id: 'staff-user-id',
      profile: { role: UserRole.STAFF },
    });

    await request(app.getHttpServer())
      .get('/admin/staff')
      .set('Authorization', 'Bearer staff-token')
      .expect(HttpStatus.FORBIDDEN);
    expect(list).not.toHaveBeenCalled();
  });

  it('allows an Administrator to create a Staff record', async () => {
    getUser.mockResolvedValue({
      id: 'admin-user-id',
      profile: { role: UserRole.ADMIN },
    });
    create.mockResolvedValue({
      id: staffId,
      employmentStatus: EmploymentStatus.ACTIVE,
    });

    const body = {
      userId,
      firstName: 'Mina',
      lastName: 'Santos',
      phoneNumber: '+639171234567',
    };
    await request(app.getHttpServer())
      .post('/admin/staff')
      .set('Authorization', 'Bearer admin-token')
      .send(body)
      .expect(HttpStatus.CREATED)
      .expect({ id: staffId, employmentStatus: EmploymentStatus.ACTIVE });

    expect(create).toHaveBeenCalledWith(body);
  });

  it('rejects invalid Staff onboarding input', async () => {
    getUser.mockResolvedValue({
      id: 'admin-user-id',
      profile: { role: UserRole.ADMIN },
    });

    await request(app.getHttpServer())
      .post('/admin/staff')
      .set('Authorization', 'Bearer admin-token')
      .send({
        userId: 'not-a-uuid',
        firstName: '',
        lastName: '',
        phoneNumber: '123',
        role: UserRole.ADMIN,
      })
      .expect(HttpStatus.BAD_REQUEST);
    expect(create).not.toHaveBeenCalled();
  });

  it('transforms Staff list filters and pagination', async () => {
    getUser.mockResolvedValue({
      id: 'admin-user-id',
      profile: { role: UserRole.ADMIN },
    });
    list.mockResolvedValue({
      data: [],
      meta: { page: 2, limit: 10, total: 0, totalPages: 0 },
    });

    await request(app.getHttpServer())
      .get('/admin/staff?page=2&limit=10&hasDriver=false')
      .set('Authorization', 'Bearer admin-token')
      .expect(HttpStatus.OK);

    expect(list).toHaveBeenCalledWith(
      expect.objectContaining({ page: 2, limit: 10, hasDriver: false }),
    );
  });

  it('validates Staff IDs before calling the service', async () => {
    getUser.mockResolvedValue({
      id: 'admin-user-id',
      profile: { role: UserRole.ADMIN },
    });

    await request(app.getHttpServer())
      .get('/admin/staff/not-a-uuid')
      .set('Authorization', 'Bearer admin-token')
      .expect(HttpStatus.BAD_REQUEST);
    expect(detail).not.toHaveBeenCalled();
  });

  it('allows an Administrator to suspend Staff employment', async () => {
    getUser.mockResolvedValue({
      id: 'admin-user-id',
      profile: { role: UserRole.ADMIN },
    });
    updateEmploymentStatus.mockResolvedValue({
      id: staffId,
      employmentStatus: EmploymentStatus.SUSPENDED,
    });

    await request(app.getHttpServer())
      .patch(`/admin/staff/${staffId}/employment-status`)
      .set('Authorization', 'Bearer admin-token')
      .send({ employmentStatus: EmploymentStatus.SUSPENDED })
      .expect(HttpStatus.OK);

    expect(updateEmploymentStatus).toHaveBeenCalledWith(
      staffId,
      EmploymentStatus.SUSPENDED,
    );
  });
});
