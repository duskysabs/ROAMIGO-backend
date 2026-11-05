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
import { FuelType, UserRole } from '../../src/generated/prisma/enums.js';
import { FleetService } from '../../src/fleet/fleet.service.js';

describe('Fleet HTTP authorization and validation', () => {
  let app: INestApplication<App>;

  const getUser = vi.fn();
  const listVehicles = vi.fn();
  const createVehicle = vi.fn();
  const createDriver = vi.fn();

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(AuthService)
      .useValue({ getUser })
      .overrideProvider(FleetService)
      .useValue({ listVehicles, createVehicle, createDriver })
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

  it('allows Staff to list vehicles with transformed pagination', async () => {
    getUser.mockResolvedValue({
      id: 'staff-user-id',
      profile: { role: UserRole.STAFF },
    });
    listVehicles.mockResolvedValue({
      data: [],
      meta: { page: 2, limit: 10, total: 0, totalPages: 0 },
    });

    await request(app.getHttpServer())
      .get('/staff/vehicles?page=2&limit=10&includeDeleted=false')
      .set('Authorization', 'Bearer staff-token')
      .expect(HttpStatus.OK);

    expect(listVehicles).toHaveBeenCalledWith(
      expect.objectContaining({ page: 2, limit: 10, includeDeleted: false }),
      UserRole.STAFF,
    );
  });

  it('rejects Customer access to operational fleet endpoints', async () => {
    getUser.mockResolvedValue({
      id: 'customer-user-id',
      profile: { role: UserRole.CUSTOMER },
    });

    await request(app.getHttpServer())
      .get('/staff/vehicles')
      .set('Authorization', 'Bearer customer-token')
      .expect(HttpStatus.FORBIDDEN);

    expect(listVehicles).not.toHaveBeenCalled();
  });

  it('rejects Staff access to Administrator fleet creation', async () => {
    getUser.mockResolvedValue({
      id: 'staff-user-id',
      profile: { role: UserRole.STAFF },
    });

    await request(app.getHttpServer())
      .post('/admin/fleet/vehicles')
      .set('Authorization', 'Bearer staff-token')
      .send({})
      .expect(HttpStatus.FORBIDDEN);

    expect(createVehicle).not.toHaveBeenCalled();
  });

  it('allows an Administrator to register a valid vehicle', async () => {
    getUser.mockResolvedValue({
      id: 'admin-user-id',
      profile: { role: UserRole.ADMIN },
    });
    createVehicle.mockResolvedValue({
      id: 'vehicle-id',
      vehicleStatus: 'UNAVAILABLE',
    });
    const body = {
      vehicleTypeId: '00000000-0000-4000-8000-000000000001',
      plateNumber: 'ABC 1234',
      fuelType: FuelType.DIESEL,
      fuelEfficiency: 10.5,
      vehicleModel: 'Toyota Hiace',
      passengerCapacity: 12,
      yearModel: 2025,
      color: 'White',
    };

    await request(app.getHttpServer())
      .post('/admin/fleet/vehicles')
      .set('Authorization', 'Bearer admin-token')
      .send(body)
      .expect(HttpStatus.CREATED)
      .expect({ id: 'vehicle-id', vehicleStatus: 'UNAVAILABLE' });

    expect(createVehicle).toHaveBeenCalledWith(body);
  });

  it('rejects invalid vehicle input before the service runs', async () => {
    getUser.mockResolvedValue({
      id: 'admin-user-id',
      profile: { role: UserRole.ADMIN },
    });

    await request(app.getHttpServer())
      .post('/admin/fleet/vehicles')
      .set('Authorization', 'Bearer admin-token')
      .send({
        vehicleTypeId: 'not-a-uuid',
        plateNumber: '',
        fuelType: 'STEAM',
        fuelEfficiency: 0,
        vehicleModel: '',
        passengerCapacity: 0,
        yearModel: 1800,
        color: '',
      })
      .expect(HttpStatus.BAD_REQUEST);

    expect(createVehicle).not.toHaveBeenCalled();
  });

  it('rejects an invalid Staff UUID during Driver onboarding', async () => {
    getUser.mockResolvedValue({
      id: 'admin-user-id',
      profile: { role: UserRole.ADMIN },
    });

    await request(app.getHttpServer())
      .post('/admin/fleet/drivers')
      .set('Authorization', 'Bearer admin-token')
      .send({
        staffId: 'not-a-uuid',
        licenseNumber: 'N01-23-456789',
        licenseExpiry: '2035-12-31',
      })
      .expect(HttpStatus.BAD_REQUEST);

    expect(createDriver).not.toHaveBeenCalled();
  });
});
