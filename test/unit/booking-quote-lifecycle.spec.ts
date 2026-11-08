import { BadRequestException, ConflictException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { BookingsService } from '../../src/bookings/bookings.service.js';
import {
  BookingStatus,
  BookingType,
  StopType,
} from '../../src/generated/prisma/enums.js';

describe('BookingsService quote lifecycle', () => {
  const command = {
    quoteId: '00000000-0000-4000-8000-000000000101',
    idempotencyKey: 'demo-submit-001',
  };
  const snapshot = {
    vehicleTypeId: '00000000-0000-4000-8000-000000000102',
    bookingType: BookingType.CUSTOM_TRIP,
    startDatetime: '2026-10-10T08:00:00.000Z',
    endDatetime: '2026-10-10T10:00:00.000Z',
    passengerCount: 2,
    stops: [
      {
        stopType: StopType.PICKUP,
        locationName: 'Pickup',
        formattedAddress: 'Pickup address',
        latitude: 10,
        longitude: 123,
      },
      {
        stopType: StopType.DROPOFF,
        locationName: 'Dropoff',
        formattedAddress: 'Dropoff address',
        latitude: 10.1,
        longitude: 123.1,
      },
    ],
  };

  it('returns the original booking for a repeated idempotency key', async () => {
    const existing = { id: 'booking-existing', quote: { id: command.quoteId } };
    const prisma = {
      booking: { findFirst: vi.fn().mockResolvedValue(existing) },
      bookingQuote: { findFirst: vi.fn() },
    };
    const service = new BookingsService(
      prisma as never,
      { quote: vi.fn() } as never,
      {} as never,
    );

    await expect(
      service.submitQuote('00000000-0000-4000-8000-000000000103', command),
    ).resolves.toEqual({ id: 'booking-existing' });
    expect(prisma.bookingQuote.findFirst).not.toHaveBeenCalled();
  });

  it('rejects an expired, consumed, or inaccessible quote', async () => {
    const prisma = {
      booking: { findFirst: vi.fn().mockResolvedValue(null) },
      bookingQuote: { findFirst: vi.fn().mockResolvedValue(null) },
    };
    const service = new BookingsService(
      prisma as never,
      { quote: vi.fn() } as never,
      {} as never,
    );

    await expect(
      service.submitQuote('00000000-0000-4000-8000-000000000103', command),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects reuse of the customer key for another quote', async () => {
    const prisma = {
      booking: { findFirst: vi.fn().mockResolvedValue({
        id: 'existing', quote: { id: 'different-quote' },
      }) },
    };
    const service = new BookingsService(prisma as never, {} as never, {} as never);
    await expect(service.submitQuote('customer', command)).rejects.toBeInstanceOf(ConflictException);
  });

  it('does not return another customer booking when they use the same key', async () => {
    const prisma = {
      booking: { findFirst: vi.fn(({ where }) => Promise.resolve(
        where.customerUserId === 'other-customer'
          ? { id: 'private-booking', quote: { id: command.quoteId } }
          : null,
      )) },
      bookingQuote: { findFirst: vi.fn().mockResolvedValue(null) },
    };
    const service = new BookingsService(prisma as never, {} as never, {} as never);
    await expect(service.submitQuote('customer', command)).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.booking.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { customerUserId: 'customer', idempotencyKey: command.idempotencyKey },
    }));
  });

  it.each(['', '   '])('rejects a blank key before querying the database', async (key) => {
    const service = new BookingsService({} as never, {} as never, {} as never);
    await expect(service.submitQuote('customer', { ...command, idempotencyKey: key }))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  it('returns a matching retry that commits while the quote is being read', async () => {
    const prisma = {
      booking: { findFirst: vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce({
        id: 'concurrent-booking', quote: { id: command.quoteId },
      }) },
      bookingQuote: { findFirst: vi.fn().mockResolvedValue(null) },
    };
    const service = new BookingsService(prisma as never, {} as never, {} as never);
    await expect(service.submitQuote('customer', command)).resolves.toEqual({ id: 'concurrent-booking' });
  });

  it('returns a matching retry after a competing unique-key insert commits', async () => {
    const prisma = {
      booking: { findFirst: vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce({
        id: 'winner', quote: { id: command.quoteId },
      }) },
      bookingQuote: { findFirst: vi.fn().mockResolvedValue({ requestSnapshot: snapshot }) },
      $transaction: vi.fn().mockRejectedValue({ code: 'P2002' }),
    };
    const service = new BookingsService(prisma as never, {} as never, {} as never);
    (service as any).validateBookingSelections = vi.fn();
    (service as any).hasEligibleInternalVehicle = vi.fn().mockResolvedValue(true);
    await expect(service.submitQuote('customer', command)).resolves.toEqual({ id: 'winner' });
  });

  it('claims the quote, persists the booking, and records the initial transition', async () => {
    const transaction = vi.fn();
    const outerFindFirst = vi.fn().mockResolvedValue(null);
    const tx = {
      booking: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({ id: 'booking-new' }),
      },
      bookingQuote: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        update: vi.fn(),
      },
      bookingTransition: { create: vi.fn() },
    };
    transaction.mockImplementation((callback: (client: typeof tx) => unknown) =>
      callback(tx),
    );
    const prisma = {
      booking: { findFirst: outerFindFirst },
      bookingQuote: {
        findFirst: vi.fn().mockResolvedValue({
          id: command.quoteId,
          requestSnapshot: snapshot,
          pricingConfigId: '00000000-0000-4000-8000-000000000104',
          totalDistanceKm: '0.00',
          estimatedDurationMinutes: 120,
          finalQuotedPrice: '1200.00',
          pricingConfiguration: { baseRate: '1200.00' },
        }),
      },
      $transaction: transaction,
    };
    const service = new BookingsService(
      prisma as never,
      { quote: vi.fn() } as never,
      {} as never,
    );
    // The persisted quote was already validated at issuance. This test isolates
    // durable consumption and transition evidence from availability queries.
    (service as any).validateBookingSelections = vi.fn().mockResolvedValue({});
    (service as any).hasEligibleInternalVehicle = vi
      .fn()
      .mockResolvedValue(true);

    await expect(
      service.submitQuote('00000000-0000-4000-8000-000000000103', command),
    ).resolves.toEqual({ id: 'booking-new' });
    expect(tx.bookingQuote.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: command.quoteId,
          consumedAt: null,
        }),
      }),
    );
    expect(tx.bookingTransition.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        bookingId: 'booking-new',
        previousState: BookingStatus.DRAFT,
        nextState: BookingStatus.AWAITING_PAYMENT,
      }),
    });
  });

  it('creates a review booking when no internal vehicle is available and the customer opts in', async () => {
    const tx = {
      booking: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({ id: 'booking-review' }),
      },
      bookingQuote: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        update: vi.fn(),
      },
      bookingTransition: { create: vi.fn() },
      userProfile: { findMany: vi.fn().mockResolvedValue([]) },
      notification: { createMany: vi.fn() },
    };
    const prisma = {
      booking: { findFirst: vi.fn().mockResolvedValue(null) },
      bookingQuote: {
        findFirst: vi.fn().mockResolvedValue({
          id: command.quoteId,
          requestSnapshot: snapshot,
          pricingConfigId: '00000000-0000-4000-8000-000000000104',
          totalDistanceKm: '0.00',
          estimatedDurationMinutes: 120,
          finalQuotedPrice: '1200.00',
          pricingConfiguration: { baseRate: '1200.00' },
        }),
      },
      $transaction: vi.fn((callback: (client: typeof tx) => unknown) =>
        callback(tx),
      ),
    };
    const service = new BookingsService(
      prisma as never,
      { quote: vi.fn() } as never,
      {} as never,
    );
    (service as any).validateBookingSelections = vi.fn().mockResolvedValue({});
    (service as any).hasEligibleInternalVehicle = vi
      .fn()
      .mockResolvedValue(false);

    await expect(
      service.submitQuote('00000000-0000-4000-8000-000000000103', {
        ...command,
        requestReviewIfUnavailable: true,
      }),
    ).resolves.toEqual({ id: 'booking-review' });
    expect(tx.booking.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        bookingStatus: BookingStatus.BOOKING_REVIEW,
      }),
    });
    expect(tx.bookingTransition.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        previousState: BookingStatus.DRAFT,
        nextState: BookingStatus.BOOKING_REVIEW,
      }),
    });
  });
});
