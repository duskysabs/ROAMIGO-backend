import { type INestApplication, NotFoundException, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from '../../src/auth/auth.service.js';
import { UserRole } from '../../src/generated/prisma/enums.js';
import { BookingsController } from '../../src/bookings/bookings.controller.js';
import { BookingsService } from '../../src/bookings/bookings.service.js';
import { BookingReviewsService } from '../../src/bookings/booking-reviews.service.js';
import { UnpaidCancellationsService } from '../../src/bookings/unpaid-cancellations.service.js';

describe('Unpaid cancellation HTTP access and validation', () => {
  let app: INestApplication;
  const id = '00000000-0000-4000-8000-000000000001';
  const getUser = vi.fn(); const cancel = vi.fn();
  beforeAll(async () => {
    const module = await Test.createTestingModule({ controllers: [BookingsController], providers: [
      { provide: BookingsService, useValue: {} }, { provide: BookingReviewsService, useValue: {} },
      { provide: UnpaidCancellationsService, useValue: { cancel } }, { provide: AuthService, useValue: { getUser } },
    ] }).compile();
    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
  });
  beforeEach(() => vi.resetAllMocks());
  afterAll(async () => { await app.close(); });
  it('denies anonymous cancellation', async () => {
    await request(app.getHttpServer()).post(`/bookings/${id}/cancel`).send({ reason: 'Cancel request' }).expect(401);
    expect(cancel).not.toHaveBeenCalled();
  });
  it.each([UserRole.ADMIN, UserRole.STAFF, UserRole.DRIVER])('denies %s cancellation', async (role) => {
    getUser.mockResolvedValue({ id, profile: { role } });
    await request(app.getHttpServer()).post(`/bookings/${id}/cancel`).set('Authorization', 'Bearer synthetic').send({ reason: 'Cancel request' }).expect(403);
  });
  it('trims a valid Customer reason and delegates the authenticated identity', async () => {
    getUser.mockResolvedValue({ id, profile: { role: UserRole.CUSTOMER } });
    cancel.mockResolvedValue({ bookingId: id, bookingStatus: 'CANCELLED', penaltyAmount: '0.00' });
    await request(app.getHttpServer()).post(`/bookings/${id}/cancel`).set('Authorization', 'Bearer synthetic').send({ reason: '  Plans changed  ' }).expect(201);
    expect(cancel).toHaveBeenCalledWith(id, id, { reason: 'Plans changed' });
  });
  it.each([{ reason: '  ' }, { reason: 'Plans changed', penaltyAmount: '0' }, { reason: 'Plans changed', bookingStatus: 'CANCELLED' }])('rejects invalid or client-owned policy fields: %j', async (body) => {
    getUser.mockResolvedValue({ id, profile: { role: UserRole.CUSTOMER } });
    await request(app.getHttpServer()).post(`/bookings/${id}/cancel`).set('Authorization', 'Bearer synthetic').send(body).expect(400);
    expect(cancel).not.toHaveBeenCalled();
  });
  it('rejects an invalid UUID and preserves cross-owner not-found behavior', async () => {
    getUser.mockResolvedValue({ id, profile: { role: UserRole.CUSTOMER } });
    await request(app.getHttpServer()).post('/bookings/not-a-uuid/cancel').set('Authorization', 'Bearer synthetic').send({ reason: 'Plans changed' }).expect(400);
    cancel.mockRejectedValue(new NotFoundException('Booking not found'));
    await request(app.getHttpServer()).post(`/bookings/${id}/cancel`).set('Authorization', 'Bearer synthetic').send({ reason: 'Plans changed' }).expect(404);
  });
});
