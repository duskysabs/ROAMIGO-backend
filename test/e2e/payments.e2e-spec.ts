import { type INestApplication, UnauthorizedException, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from '../../src/auth/auth.service.js';
import { UserRole } from '../../src/generated/prisma/enums.js';
import { PaymentsController } from '../../src/payments/payments.controller.js';
import { PaymentsService } from '../../src/payments/payments.service.js';
import { AssignmentsController } from '../../src/assignments/assignments.controller.js';
import { AssignmentsService } from '../../src/assignments/assignments.service.js';

describe('Manual payment HTTP boundaries', () => {
  let app: INestApplication;
  const id = '00000000-0000-4000-8000-000000000001';
  const getUser = vi.fn();
  const payments = { record: vi.fn(), review: vi.fn(), listMine: vi.fn(), pending: vi.fn() };
  const assignments = { retry: vi.fn(), pending: vi.fn() };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [PaymentsController, AssignmentsController],
      providers: [
        { provide: PaymentsService, useValue: payments },
        { provide: AssignmentsService, useValue: assignments },
        { provide: AuthService, useValue: { getUser } },
      ],
    }).compile();
    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
  });
  beforeEach(() => vi.resetAllMocks());
  afterAll(async () => { await app.close(); });

  it.each([UserRole.CUSTOMER, UserRole.DRIVER])('forbids %s payment approval', async (role) => {
    getUser.mockResolvedValue({ id, profile: { role } });
    await request(app.getHttpServer()).post(`/staff/payment-reviews/${id}/approve`).set('Authorization', 'Bearer token').send({ reason: 'Receipt checked' }).expect(403);
    expect(payments.review).not.toHaveBeenCalled();
  });

  it.each([UserRole.ADMIN, UserRole.STAFF])('allows %s to request payment verification', async (role) => {
    getUser.mockResolvedValue({ id, profile: { role } });
    payments.review.mockResolvedValue({ payment: { paymentStatus: 'PAID' }, assignment: { status: 'PENDING' } });
    await request(app.getHttpServer()).post(`/staff/payment-reviews/${id}/approve`).set('Authorization', 'Bearer token').send({ reason: 'Receipt checked' }).expect(201);
    expect(payments.review).toHaveBeenCalledWith(id, id, true, { reason: 'Receipt checked' });
  });

  it('rejects client-controlled status fields', async () => {
    getUser.mockResolvedValue({ id, profile: { role: UserRole.STAFF } });
    await request(app.getHttpServer()).post(`/staff/bookings/${id}/payments/manual`).set('Authorization', 'Bearer token')
      .send({ method: 'BANK_TRANSFER', reference: 'BANK-123', amount: '1200.00', reason: 'Receipt entered', paymentStatus: 'PAID' }).expect(400);
    expect(payments.record).not.toHaveBeenCalled();
  });

  it('normalizes receipt references and requires an exact decimal string', async () => {
    getUser.mockResolvedValue({ id, profile: { role: UserRole.STAFF } });
    payments.record.mockResolvedValue({ paymentStatus: 'PENDING' });
    await request(app.getHttpServer()).post(`/staff/bookings/${id}/payments/manual`).set('Authorization', 'Bearer token')
      .send({ method: 'BANK_TRANSFER', reference: ' bank-123 ', amount: '1200.00', reason: 'Receipt entered' }).expect(201);
    expect(payments.record).toHaveBeenCalledWith(id, id, expect.objectContaining({ reference: 'BANK-123' }));
    await request(app.getHttpServer()).post(`/staff/bookings/${id}/payments/manual`).set('Authorization', 'Bearer token')
      .send({ method: 'CASH', reference: 'CASH-123', amount: 1200, reason: 'Receipt entered' }).expect(400);
  });

  it('passes authenticated customer ownership to payment reads', async () => {
    getUser.mockResolvedValue({ id: 'customer', profile: { role: UserRole.CUSTOMER } });
    payments.listMine.mockResolvedValue([]);
    await request(app.getHttpServer()).get(`/bookings/${id}/payments`).set('Authorization', 'Bearer token').expect(200);
    expect(payments.listMine).toHaveBeenCalledWith('customer', id, expect.objectContaining({ limit: 20 }));
  });

  it('denies unauthenticated assignment retries', async () => {
    getUser.mockRejectedValue(new UnauthorizedException());
    await request(app.getHttpServer()).post(`/staff/assignment-requests/${id}/retry`).expect(401);
    expect(assignments.retry).not.toHaveBeenCalled();
  });
});
