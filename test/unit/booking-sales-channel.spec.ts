import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { BookingsService } from '../../src/bookings/bookings.service.js';
import { AccountStatus, BookingSalesChannel, BookingType, UserRole } from '../../src/generated/prisma/enums.js';

describe('Server-owned booking sales channel', () => {
  const request = {
    bookingType: BookingType.TOUR_PACKAGE, vehicleTypeId: 'van', tourPackageId: 'package',
    startDatetime: '2099-01-01T08:00:00Z', endDatetime: '2099-01-01T10:00:00Z', passengerCount: 2,
  };
  const command = { quoteId: 'quote', idempotencyKey: 'synthetic-command' };
  function setup() {
    const quote = { id: 'quote', customerUserId: 'customer', salesChannel: BookingSalesChannel.FACE_TO_FACE,
      operatorUserId: 'operator', operatorReason: 'Customer present at office',
      requestSnapshot: { ...request, stops: [] }, pricingConfiguration: { baseRate: '1200' },
      pricingConfigId: 'price', totalDistanceKm: '0', estimatedDurationMinutes: 120, finalQuotedPrice: '1200' };
    const tx = {
      $queryRaw: vi.fn(),
      userProfile: { findUnique: vi.fn(({ where }) => Promise.resolve(where.userId !== 'customer'
        ? { role: UserRole.ADMIN, accountStatus: AccountStatus.ACTIVE, staff: null }
        : { role: UserRole.CUSTOMER, accountStatus: AccountStatus.ACTIVE })) },
      bookingQuote: { create: vi.fn().mockResolvedValue(quote), findFirst: vi.fn().mockResolvedValue(quote),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }), update: vi.fn() },
      booking: { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn().mockResolvedValue({ id: 'booking' }) },
      bookingTransition: { create: vi.fn() },
    };
    const prisma = { ...tx, $transaction: vi.fn((callback: (client: typeof tx) => unknown) => callback(tx)) };
    const pricing = { quote: vi.fn().mockResolvedValue({ pricingConfigurationId: 'price', finalQuotedPrice: '1200', totalDistanceKm: '0', estimatedDurationMinutes: 120 }) };
    const service = new BookingsService(prisma as never, pricing as never, {} as never);
    const internals = service as unknown as { validateBookingSelections: () => Promise<{ stops: [] }>; hasEligibleInternalVehicle: () => Promise<boolean> };
    vi.spyOn(internals, 'validateBookingSelections').mockResolvedValue({ stops: [] });
    vi.spyOn(internals, 'hasEligibleInternalVehicle').mockResolvedValue(true);
    return { service, tx, quote };
  }

  it('customer quotes always persist ONLINE without operator provenance', async () => {
    const { service, tx } = setup();
    await service.issueQuote('customer', request);
    expect(tx.bookingQuote.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
      salesChannel: BookingSalesChannel.ONLINE, operatorUserId: undefined,
    }) }));
  });

  it('staff quotes persist the actor and reason separately from client booking data', async () => {
    const { service, tx } = setup();
    await service.issueFaceToFaceQuote('operator', { ...request, customerUserId: 'customer', reason: 'Customer present at office' });
    const data = tx.bookingQuote.create.mock.calls[0]![0].data;
    expect(data).toMatchObject({ salesChannel: BookingSalesChannel.FACE_TO_FACE, operatorUserId: 'operator', operatorReason: 'Customer present at office' });
    expect(data.requestSnapshot).not.toHaveProperty('customerUserId');
    expect(data.requestSnapshot).not.toHaveProperty('reason');
  });

  it('driver-linked operators cannot issue face-to-face quotes', async () => {
    const { service, tx } = setup();
    tx.userProfile.findUnique.mockResolvedValue({ role: UserRole.ADMIN, accountStatus: AccountStatus.ACTIVE, staff: { driver: {} } } as never);
    await expect(service.issueFaceToFaceQuote('operator', { ...request, customerUserId: 'customer', reason: 'Synthetic note' })).rejects.toBeInstanceOf(ForbiddenException);
    expect(tx.bookingQuote.create).not.toHaveBeenCalled();
  });

  it('a customer cannot consume an operator quote through the public submission path', async () => {
    const { service, tx, quote } = setup();
    tx.bookingQuote.findFirst.mockImplementation(({ where }) => Promise.resolve(where.salesChannel === quote.salesChannel ? quote : null));
    await expect(service.submitQuote('customer', command)).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.booking.create).not.toHaveBeenCalled();
  });

  it('another operator cannot consume the quote', async () => {
    const { service, tx, quote } = setup();
    tx.bookingQuote.findFirst.mockImplementation(({ where }) => Promise.resolve(where.operatorUserId === quote.operatorUserId ? quote : null));
    await expect(service.submitFaceToFaceQuote('another-operator', command)).rejects.toBeInstanceOf(NotFoundException);
    expect(tx.booking.create).not.toHaveBeenCalled();
  });

  it('the issuing operator submits a face-to-face booking with its own audited actor', async () => {
    const { service, tx } = setup();
    await service.submitFaceToFaceQuote('operator', command);
    expect(tx.booking.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
      customerUserId: 'customer', salesChannel: BookingSalesChannel.FACE_TO_FACE,
    }) }));
    expect(tx.bookingTransition.create).toHaveBeenCalledWith({ data: expect.objectContaining({ actorUserId: 'operator', reason: 'Face-to-face booking: Customer present at office' }) });
  });
});
