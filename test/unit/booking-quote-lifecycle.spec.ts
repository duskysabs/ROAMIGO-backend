import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { BookingsService } from '../../src/bookings/bookings.service.js';
import { BookingStatus, BookingType, StopType } from '../../src/generated/prisma/enums.js';

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
      { stopType: StopType.PICKUP, locationName: 'Pickup', formattedAddress: 'Pickup address', latitude: 10, longitude: 123 },
      { stopType: StopType.DROPOFF, locationName: 'Dropoff', formattedAddress: 'Dropoff address', latitude: 10.1, longitude: 123.1 },
    ],
  };

  it('returns the original booking for a repeated idempotency key', async () => {
    const existing = { id: 'booking-existing' };
    const prisma = {
      booking: { findUnique: vi.fn().mockResolvedValue(existing) },
      bookingQuote: { findFirst: vi.fn() },
    };
    const service = new BookingsService(prisma as never, { quote: vi.fn() } as never, {} as never);

    await expect(service.submitQuote('00000000-0000-4000-8000-000000000103', command)).resolves.toBe(existing);
    expect(prisma.bookingQuote.findFirst).not.toHaveBeenCalled();
  });

  it('rejects an expired, consumed, or inaccessible quote', async () => {
    const prisma = {
      booking: { findUnique: vi.fn().mockResolvedValue(null) },
      bookingQuote: { findFirst: vi.fn().mockResolvedValue(null) },
    };
    const service = new BookingsService(prisma as never, { quote: vi.fn() } as never, {} as never);

    await expect(service.submitQuote('00000000-0000-4000-8000-000000000103', command)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('claims the quote, persists the booking, and records the initial transition', async () => {
    const transaction = vi.fn();
    const outerFindUnique = vi.fn().mockResolvedValue(null);
    const tx = {
      booking: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({ id: 'booking-new' }),
      },
      bookingQuote: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        update: vi.fn(),
      },
      bookingTransition: { create: vi.fn() },
    };
    transaction.mockImplementation((callback: (client: typeof tx) => unknown) => callback(tx));
    const prisma = {
      booking: { findUnique: outerFindUnique },
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
    const service = new BookingsService(prisma as never, { quote: vi.fn() } as never, {} as never);
    // The persisted quote was already validated at issuance. This test isolates
    // durable consumption and transition evidence from availability queries.
    (service as any).validateBookingSelections = vi.fn().mockResolvedValue({});

    await expect(service.submitQuote('00000000-0000-4000-8000-000000000103', command)).resolves.toEqual({ id: 'booking-new' });
    expect(tx.bookingQuote.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: command.quoteId, consumedAt: null }),
    }));
    expect(tx.bookingTransition.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        bookingId: 'booking-new',
        previousState: BookingStatus.DRAFT,
        nextState: BookingStatus.AWAITING_PAYMENT,
      }),
    });
  });
});
