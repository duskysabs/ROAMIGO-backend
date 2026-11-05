import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { BookingReviewsService } from '../../src/bookings/booking-reviews.service.js';
import { BookingReviewDecision } from '../../src/bookings/dto/booking-review-decision.dto.js';
import { BookingStatus } from '../../src/generated/prisma/enums.js';

describe('BookingReviewsService', () => {
  it('records outsourced details without creating an internal assignment', async () => {
    const details = { id: 'outsourced-details-id' };
    const tx = {
      booking: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'booking-id',
          customerUserId: 'customer-id',
          vehicleTypeId: 'vehicle-type-id',
          bookingStatus: BookingStatus.BOOKING_REVIEW,
        }),
      },
      outsourcedDetails: { upsert: vi.fn().mockResolvedValue(details) },
      notification: { create: vi.fn() },
    };
    const prisma = {
      staff: { findUnique: vi.fn().mockResolvedValue({ id: 'staff-id' }) },
      $transaction: vi.fn((callback: (client: typeof tx) => unknown) =>
        callback(tx),
      ),
    };
    const service = new BookingReviewsService(prisma as never);

    await expect(
      service.recordOutsourcedDetails('staff-user-id', 'booking-id', {
        vehicleModel: ' Toyota Hiace ',
        plateNumber: 'abc 1234',
        vehicleProvider: 'Partner Transport',
        driverName: 'Juan Dela Cruz',
        driverContact: '09171234567',
        agreedCost: 4500,
      }),
    ).resolves.toBe(details);

    expect(tx.outsourcedDetails.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { bookingId: 'booking-id' },
        create: expect.objectContaining({
          vehicleTypeId: 'vehicle-type-id',
          vehicleModel: 'Toyota Hiace',
          plateNumber: 'ABC 1234',
          recordedByStaffId: 'staff-id',
        }),
      }),
    );
    expect(tx.notification.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ recipientUserId: 'customer-id' }),
    });
    expect(tx).not.toHaveProperty('bookingAssignment');
  });

  it('does not allow approval until outsourced details exist', async () => {
    const tx = {
      booking: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'booking-id',
          bookingStatus: BookingStatus.BOOKING_REVIEW,
          outsourcedDetails: null,
        }),
      },
    };
    const prisma = {
      $transaction: vi.fn((callback: (client: typeof tx) => unknown) =>
        callback(tx),
      ),
    };
    const service = new BookingReviewsService(prisma as never);

    await expect(
      service.decide('customer-id', 'booking-id', {
        decision: BookingReviewDecision.APPROVE,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('moves an approved outsourced booking to awaiting payment', async () => {
    const tx = {
      booking: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'booking-id',
          bookingStatus: BookingStatus.BOOKING_REVIEW,
          outsourcedDetails: { id: 'outsourced-details-id' },
        }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      bookingTransition: { create: vi.fn() },
      userProfile: { findMany: vi.fn().mockResolvedValue([]) },
      notification: { createMany: vi.fn() },
    };
    const prisma = {
      $transaction: vi.fn((callback: (client: typeof tx) => unknown) =>
        callback(tx),
      ),
    };
    const service = new BookingReviewsService(prisma as never);

    await expect(
      service.decide('customer-id', 'booking-id', {
        decision: BookingReviewDecision.APPROVE,
      }),
    ).resolves.toEqual({
      bookingId: 'booking-id',
      bookingStatus: BookingStatus.AWAITING_PAYMENT,
    });
    expect(tx.booking.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'booking-id',
        bookingStatus: BookingStatus.BOOKING_REVIEW,
      },
      data: { bookingStatus: BookingStatus.AWAITING_PAYMENT },
    });
    expect(tx.bookingTransition.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        previousState: BookingStatus.BOOKING_REVIEW,
        nextState: BookingStatus.AWAITING_PAYMENT,
      }),
    });
  });

  it('cancels a review when the customer rejects the outsourced details', async () => {
    const tx = {
      booking: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'booking-id',
          bookingStatus: BookingStatus.BOOKING_REVIEW,
          outsourcedDetails: { id: 'outsourced-details-id' },
        }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      bookingTransition: { create: vi.fn() },
      userProfile: { findMany: vi.fn().mockResolvedValue([]) },
      notification: { createMany: vi.fn() },
    };
    const prisma = {
      $transaction: vi.fn((callback: (client: typeof tx) => unknown) =>
        callback(tx),
      ),
    };
    const service = new BookingReviewsService(prisma as never);

    await expect(
      service.decide('customer-id', 'booking-id', {
        decision: BookingReviewDecision.REJECT,
      }),
    ).resolves.toEqual({
      bookingId: 'booking-id',
      bookingStatus: BookingStatus.CANCELLED,
    });
  });

  it('allows staff to reject a review that cannot be fulfilled', async () => {
    const tx = {
      booking: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'booking-id',
          customerUserId: 'customer-id',
          bookingStatus: BookingStatus.BOOKING_REVIEW,
        }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      bookingTransition: { create: vi.fn() },
      notification: { create: vi.fn() },
    };
    const prisma = {
      $transaction: vi.fn((callback: (client: typeof tx) => unknown) =>
        callback(tx),
      ),
    };
    const service = new BookingReviewsService(prisma as never);

    await expect(
      service.rejectByStaff(
        'staff-user-id',
        'booking-id',
        'No external vehicle could be secured',
      ),
    ).resolves.toEqual({
      bookingId: 'booking-id',
      bookingStatus: BookingStatus.REJECTED,
    });
    expect(tx.notification.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ recipientUserId: 'customer-id' }),
    });
  });
});
