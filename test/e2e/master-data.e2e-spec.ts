import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from '../../src/auth/auth.service.js';
import { UserRole } from '../../src/generated/prisma/enums.js';
import { VehicleTypesController } from '../../src/vehicle-types/vehicle-types.controller.js';
import { VehicleTypesService } from '../../src/vehicle-types/vehicle-types.service.js';
import { TourPackagesController } from '../../src/tour-packages/tour-packages.controller.js';
import { TourPackagesService } from '../../src/tour-packages/tour-packages.service.js';
import { PricingConfigurationsController } from '../../src/pricing/pricing-configurations.controller.js';
import { PricingConfigurationsService } from '../../src/pricing/pricing-configurations.service.js';

describe('Master-data HTTP permissions and command contracts', () => {
  let app: INestApplication; const id = '00000000-0000-4000-8000-000000000001'; const getUser = vi.fn();
  const types = { list: vi.fn(), create: vi.fn(), update: vi.fn() };
  const packages = { findForCustomers: vi.fn(), findOneForCustomers: vi.fn(), findForStaff: vi.fn(), create: vi.fn(), update: vi.fn(), replaceStops: vi.fn(), setStatus: vi.fn() };
  const prices = { findAll: vi.fn(), create: vi.fn(), setActive: vi.fn(), switchActive: vi.fn() };
  beforeAll(async () => {
    const module = await Test.createTestingModule({ controllers: [VehicleTypesController, TourPackagesController, PricingConfigurationsController], providers: [
      { provide: AuthService, useValue: { getUser } }, { provide: VehicleTypesService, useValue: types },
      { provide: TourPackagesService, useValue: packages }, { provide: PricingConfigurationsService, useValue: prices },
    ] }).compile();
    app = module.createNestApplication(); app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })); await app.init();
  });
  beforeEach(() => vi.resetAllMocks()); afterAll(async () => { await app.close(); });
  it('denies anonymous management', async () => {
    await request(app.getHttpServer()).get('/admin/vehicle-types').expect(401);
    expect(types.list).not.toHaveBeenCalled();
  });
  it.each([UserRole.CUSTOMER, UserRole.STAFF, UserRole.DRIVER])('denies %s all Admin mutation families', async role => {
    getUser.mockResolvedValue({ id, profile: { role } });
    await request(app.getHttpServer()).post('/admin/vehicle-types').set('Authorization', 'Bearer synthetic').send({ vehicleType: 'VAN' }).expect(403);
    await request(app.getHttpServer()).patch(`/admin/tour-packages/${id}`).set('Authorization', 'Bearer synthetic').send({ packageName: 'Synthetic' }).expect(403);
    await request(app.getHttpServer()).post(`/admin/pricing-configurations/${id}/activate`).set('Authorization', 'Bearer synthetic').expect(403);
    await request(app.getHttpServer()).post(`/admin/pricing-configurations/${id}/switch`).set('Authorization', 'Bearer synthetic').send({ expectedActiveIds: [] }).expect(403);
  });
  it('blocks linked Drivers even with an Admin role', async () => {
    getUser.mockResolvedValue({ id, isDriver: true, profile: { role: UserRole.ADMIN } });
    await request(app.getHttpServer()).get('/admin/vehicle-types').set('Authorization', 'Bearer synthetic').expect(403);
  });
  it('forwards verified actor identity for category, package and pricing actions', async () => {
    getUser.mockResolvedValue({ id, profile: { role: UserRole.ADMIN } });
    types.create.mockResolvedValue({ id }); types.update.mockResolvedValue({ id }); packages.update.mockResolvedValue({ id }); prices.setActive.mockResolvedValue({ id });
    await request(app.getHttpServer()).post('/admin/vehicle-types').set('Authorization', 'Bearer synthetic').send({ vehicleType: 'VAN' }).expect(201);
    await request(app.getHttpServer()).patch(`/admin/vehicle-types/${id}`).set('Authorization', 'Bearer synthetic').send({ isActive: false }).expect(200);
    await request(app.getHttpServer()).patch(`/admin/tour-packages/${id}`).set('Authorization', 'Bearer synthetic').send({ packageName: 'Synthetic' }).expect(200);
    await request(app.getHttpServer()).post(`/admin/pricing-configurations/${id}/activate`).set('Authorization', 'Bearer synthetic').expect(201);
    expect(types.update).toHaveBeenCalledWith(id, id, { isActive: false });
    expect(packages.update).toHaveBeenCalledWith(id, id, { packageName: 'Synthetic' });
    expect(prices.setActive).toHaveBeenCalledWith(id, id, true);
  });
  it('rejects forged audit fields, unknown categories, renaming and invalid IDs', async () => {
    getUser.mockResolvedValue({ id, profile: { role: UserRole.ADMIN } });
    for (const body of [{ vehicleType: 'OTHER' }, { vehicleType: 'VAN', actorUserId: id }]) {
      await request(app.getHttpServer()).post('/admin/vehicle-types').set('Authorization', 'Bearer synthetic').send(body).expect(400);
    }
    await request(app.getHttpServer()).patch(`/admin/vehicle-types/${id}`).set('Authorization', 'Bearer synthetic').send({ isActive: true, vehicleType: 'BUS' }).expect(400);
    await request(app.getHttpServer()).post('/admin/pricing-configurations/invalid/activate').set('Authorization', 'Bearer synthetic').expect(400);
  });
  it('retains Staff read access while denying Driver-linked Staff', async () => {
    getUser.mockResolvedValue({ id, profile: { role: UserRole.STAFF } }); packages.findForStaff.mockResolvedValue([]);
    await request(app.getHttpServer()).get('/staff/tour-packages').set('Authorization', 'Bearer synthetic').expect(200);
    expect(packages.findForStaff).toHaveBeenCalledWith(id);
    getUser.mockResolvedValue({ id, isDriver: true, profile: { role: UserRole.STAFF } });
    await request(app.getHttpServer()).get('/staff/tour-packages').set('Authorization', 'Bearer synthetic').expect(403);
  });
  it('validates pricing switch expectations and forwards only the verified actor', async () => {
    getUser.mockResolvedValue({ id, profile: { role: UserRole.ADMIN } });
    for (const body of [{}, { expectedActiveIds: ['invalid'] }, { expectedActiveIds: [id, id] }, { expectedActiveIds: [], actorUserId: id }]) {
      await request(app.getHttpServer()).post(`/admin/pricing-configurations/${id}/switch`).set('Authorization', 'Bearer synthetic').send(body).expect(400);
    }
    expect(prices.switchActive).not.toHaveBeenCalled();
    await request(app.getHttpServer()).post(`/admin/pricing-configurations/${id}/switch`).set('Authorization', 'Bearer synthetic').send({ expectedActiveIds: [id] }).expect(201);
    expect(prices.switchActive).toHaveBeenCalledWith(id, id, [id]);
  });
});
