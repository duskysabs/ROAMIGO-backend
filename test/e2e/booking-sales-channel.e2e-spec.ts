import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from '../../src/auth/auth.service.js';
import { UserRole } from '../../src/generated/prisma/enums.js';
import { FaceToFaceBookingsController } from '../../src/bookings/face-to-face-bookings.controller.js';
import { BookingsController } from '../../src/bookings/bookings.controller.js';
import { BookingsService } from '../../src/bookings/bookings.service.js';
import { BookingReviewsService } from '../../src/bookings/booking-reviews.service.js';
import { UnpaidCancellationsService } from '../../src/bookings/unpaid-cancellations.service.js';

describe('Booking sales channel HTTP boundary', () => {
  let app: INestApplication;
  const id = '00000000-0000-4000-8000-000000000001';
  const getUser = vi.fn();
  const bookings = { issueFaceToFaceQuote: vi.fn(), submitFaceToFaceQuote: vi.fn(), issueQuote: vi.fn(), submitQuote: vi.fn() };
  const quote = { customerUserId: id, reason: 'Customer present', bookingType: 'TOUR_PACKAGE',
    vehicleTypeId: id, tourPackageId: id, startDatetime: '2099-01-01T08:00:00Z', endDatetime: '2099-01-01T10:00:00Z', passengerCount: 1 };
  beforeAll(async () => {
    const module = await Test.createTestingModule({ controllers: [FaceToFaceBookingsController, BookingsController],
      providers: [ { provide: BookingsService, useValue: bookings }, { provide: BookingReviewsService, useValue: {} },
        { provide: UnpaidCancellationsService, useValue: {} },
        { provide: AuthService, useValue: { getUser } } ],
    }).compile();
    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
  });
  beforeEach(() => vi.resetAllMocks());
  afterAll(async () => { await app.close(); });

  it.each([UserRole.CUSTOMER, UserRole.DRIVER])('denies %s access to the face-to-face creation path', async (role) => {
    getUser.mockResolvedValue({ id, profile: { role } });
    await request(app.getHttpServer()).post('/staff/bookings/face-to-face/quote').set('Authorization', 'Bearer synthetic').send(quote).expect(403);
    await request(app.getHttpServer()).post('/staff/bookings/face-to-face').set('Authorization', 'Bearer synthetic').send({ quoteId: id, idempotencyKey: 'synthetic' }).expect(403);
    expect(bookings.issueFaceToFaceQuote).not.toHaveBeenCalled();
  });
  it('denies driver-linked Staff and unknown fields', async () => {
    getUser.mockResolvedValue({ id, isDriver: true, profile: { role: UserRole.STAFF } });
    await request(app.getHttpServer()).post('/staff/bookings/face-to-face/quote').set('Authorization', 'Bearer synthetic').send(quote).expect(403);
    getUser.mockResolvedValue({ id, profile: { role: UserRole.ADMIN } });
    await request(app.getHttpServer()).post('/staff/bookings/face-to-face/quote').set('Authorization', 'Bearer synthetic').send({ ...quote, salesChannel: 'FACE_TO_FACE' }).expect(400);
  });
  it.each([UserRole.ADMIN, UserRole.STAFF])('allows %s to submit a valid operator command', async (role) => {
    getUser.mockResolvedValue({ id, profile: { role } });
    bookings.issueFaceToFaceQuote.mockResolvedValue({ quoteId: id });
    bookings.submitFaceToFaceQuote.mockResolvedValue({ id, salesChannel: 'FACE_TO_FACE' });
    await request(app.getHttpServer()).post('/staff/bookings/face-to-face/quote').set('Authorization', 'Bearer synthetic').send(quote).expect(201);
    await request(app.getHttpServer()).post('/staff/bookings/face-to-face').set('Authorization', 'Bearer synthetic').send({ quoteId: id, idempotencyKey: 'synthetic' }).expect(201);
    expect(bookings.submitFaceToFaceQuote).toHaveBeenCalledWith(id, { quoteId: id, idempotencyKey: 'synthetic' });
  });
  it('rejects channel injection into customer quote and submission bodies', async () => {
    getUser.mockResolvedValue({ id, profile: { role: UserRole.CUSTOMER } });
    const { customerUserId: _customer, reason: _reason, ...customerQuote } = quote;
    await request(app.getHttpServer()).post('/bookings/quote').set('Authorization', 'Bearer synthetic').send({ ...customerQuote, salesChannel: 'FACE_TO_FACE' }).expect(400);
    await request(app.getHttpServer()).post('/bookings').set('Authorization', 'Bearer synthetic').send({ quoteId: id, idempotencyKey: 'synthetic', salesChannel: 'FACE_TO_FACE' }).expect(400);
    expect(bookings.issueQuote).not.toHaveBeenCalled();
    expect(bookings.submitQuote).not.toHaveBeenCalled();
  });
});
