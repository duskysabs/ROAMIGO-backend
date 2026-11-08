import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from '../../src/auth/auth.service.js';
import { UserRole } from '../../src/generated/prisma/enums.js';
import { DriverController, DriverResponseController, TripCompletionController } from '../../src/driver/driver.controller.js';
import { DriverService } from '../../src/driver/driver.service.js';
import { PaymentsController } from '../../src/payments/payments.controller.js';
import { PaymentsService } from '../../src/payments/payments.service.js';

describe('Driver HTTP access and command validation', () => {
  let app: INestApplication;
  const id = '00000000-0000-4000-8000-000000000001';
  const getUser = vi.fn();
  const drivers = { me: vi.fn(), list: vi.fn(), detail: vi.fn(), navigation: vi.fn(), act: vi.fn(), processExpired: vi.fn(), completion: vi.fn() };
  const payments = { pending: vi.fn() };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [DriverController, DriverResponseController, TripCompletionController, PaymentsController],
      providers: [ { provide: AuthService, useValue: { getUser } }, { provide: DriverService, useValue: drivers }, { provide: PaymentsService, useValue: payments } ],
    }).compile();
    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
  });
  beforeEach(() => { vi.resetAllMocks(); });
  afterAll(async () => { await app.close(); });

  it('allows a driver-linked Staff identity through Driver routes', async () => {
    getUser.mockResolvedValue({ id: 'driver-user', isDriver: true, profile: { role: UserRole.STAFF } });
    drivers.list.mockResolvedValue({ items: [], nextCursor: null });
    await request(app.getHttpServer()).get('/driver/assignments').set('Authorization', 'Bearer token').expect(200);
    expect(drivers.list).toHaveBeenCalledWith('driver-user', expect.objectContaining({ limit: 20 }));
  });

  it.each([UserRole.CUSTOMER, UserRole.STAFF, UserRole.ADMIN])('rejects a non-driver %s identity', async (role) => {
    getUser.mockResolvedValue({ id: 'other-user', isDriver: false, profile: { role } });
    await request(app.getHttpServer()).get(`/driver/assignments/${id}`).set('Authorization', 'Bearer token').expect(403);
    expect(drivers.detail).not.toHaveBeenCalled();
  });

  it('does not let the driver-linked identity inherit payment queue access', async () => {
    getUser.mockResolvedValue({ id: 'driver-user', isDriver: true, profile: { role: UserRole.STAFF } });
    await request(app.getHttpServer()).get('/staff/payment-reviews').set('Authorization', 'Bearer token').set('X-Is-Driver', 'false').expect(403);
    expect(payments.pending).not.toHaveBeenCalled();
  });

  it('restricts full completion snapshots to non-driver operators', async () => {
    getUser.mockResolvedValue({ id: 'driver-user', isDriver: true, profile: { role: UserRole.STAFF } });
    await request(app.getHttpServer()).get(`/staff/trip-completions/${id}`).set('Authorization', 'Bearer token').expect(403);
    expect(drivers.completion).not.toHaveBeenCalled();
    getUser.mockResolvedValue({ id: 'operator', isDriver: false, profile: { role: UserRole.ADMIN } });
    drivers.completion.mockResolvedValue({ completionSnapshot: { version: 1 } });
    await request(app.getHttpServer()).get(`/staff/trip-completions/${id}`).set('Authorization', 'Bearer token').expect(200);
    expect(drivers.completion).toHaveBeenCalledWith('operator', id);
  });

  it('rejects invented client state and price fields', async () => {
    getUser.mockResolvedValue({ id: 'driver-user', isDriver: true, profile: { role: UserRole.STAFF } });
    await request(app.getHttpServer()).post(`/driver/trips/${id}/start`).set('Authorization', 'Bearer token').send({ tripState: 'ENDED', finalQuotedPrice: 1 }).expect(400);
    expect(drivers.act).not.toHaveBeenCalled();
  });

  it('passes only the server-selected command and authenticated actor', async () => {
    getUser.mockResolvedValue({ id: 'driver-user', isDriver: true, profile: { role: UserRole.STAFF } });
    drivers.act.mockResolvedValue({ tripState: 'ACKNOWLEDGED' });
    await request(app.getHttpServer()).post(`/driver/assignments/${id}/acknowledge`).set('Authorization', 'Bearer token').send({}).expect(201);
    expect(drivers.act).toHaveBeenCalledWith('driver-user', id, 'ACKNOWLEDGED', undefined);
  });

  it('denies timeout processing to a Driver but allows a non-driver operator', async () => {
    getUser.mockResolvedValue({ id: 'driver-user', isDriver: true, profile: { role: UserRole.STAFF } });
    await request(app.getHttpServer()).post('/staff/driver-responses/process-expired').set('Authorization', 'Bearer token').send({ limit: 20 }).expect(403);
    getUser.mockResolvedValue({ id: 'operator', isDriver: false, profile: { role: UserRole.STAFF } });
    drivers.processExpired.mockResolvedValue({ processed: 0, outcomes: [] });
    await request(app.getHttpServer()).post('/staff/driver-responses/process-expired').set('Authorization', 'Bearer token').send({ limit: 20 }).expect(201);
    expect(drivers.processExpired).toHaveBeenCalledWith('operator', 20);
  });
});
