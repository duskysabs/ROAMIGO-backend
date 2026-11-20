import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { Prisma } from '../../src/generated/prisma/client.js';
import { AccountStatus, BookingStatus, CancellationCategory, CancellationStatus, UserRole } from '../../src/generated/prisma/enums.js';
import { UnpaidCancellationsService } from '../../src/bookings/unpaid-cancellations.service.js';

describe('Owned unpaid booking cancellation', () => {
  function setup() {
    const booking = { id: 'booking', customerUserId: 'customer', bookingStatus: BookingStatus.AWAITING_PAYMENT };
    const cancellation = { id: 'cancellation', bookingId: 'booking', requestedByUserId: 'customer',
      cancellationReason: 'Original customer request', cancellationCategory: CancellationCategory.CUSTOMER_REQUEST,
      cancellationStatus: CancellationStatus.COMPLETED, isLateCancellation: false,
      penaltyRate: new Prisma.Decimal(0), penaltyAmount: new Prisma.Decimal(0), reviewNotes: 'unpaid-customer-v1',
      requestedAt: new Date(), reviewedAt: new Date() };
    const tx = {
      $queryRaw: vi.fn(),
      userProfile: { findUnique: vi.fn().mockResolvedValue({ role: UserRole.CUSTOMER, accountStatus: AccountStatus.ACTIVE }),
        findMany: vi.fn().mockResolvedValue([{ userId: 'operator' }]) },
      booking: { findFirst: vi.fn().mockResolvedValue(booking), update: vi.fn() },
      bookingCancellation: { findUnique: vi.fn().mockResolvedValue(null), create: vi.fn().mockResolvedValue(cancellation) },
      payment: { findFirst: vi.fn().mockResolvedValue(null) },
      bookingAssignment: { findFirst: vi.fn().mockResolvedValue(null) },
      assignmentRequest: { findUnique: vi.fn().mockResolvedValue(null) },
      bookingTransition: { create: vi.fn() }, notification: { createMany: vi.fn() },
    };
    const prisma = { $transaction: vi.fn((callback: (client: typeof tx) => unknown) => callback(tx)) };
    return { service: new UnpaidCancellationsService(prisma as never), tx, booking, cancellation, prisma };
  }
  it('records the zero-fee policy, transition and notifications in one transaction', async () => {
    const { service, tx, prisma } = setup();
    const result = await service.cancel('customer', 'booking', { reason: 'Original customer request' });
    expect(result).toMatchObject({ bookingStatus: BookingStatus.CANCELLED, penaltyAmount: '0.00', policyVersion: 'unpaid-customer-v1' });
    expect(tx.bookingCancellation.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      requestedByUserId: 'customer', cancellationStatus: CancellationStatus.COMPLETED,
      cancellationCategory: CancellationCategory.CUSTOMER_REQUEST, penaltyAmount: '0.00', penaltyRate: '0.00',
      reviewNotes: 'unpaid-customer-v1',
    }) });
    expect(tx.bookingTransition.create).toHaveBeenCalledWith({ data: expect.objectContaining({ previousState: BookingStatus.AWAITING_PAYMENT, nextState: BookingStatus.CANCELLED, actorUserId: 'customer' }) });
    expect(tx.notification.createMany).toHaveBeenCalledWith({ data: expect.arrayContaining([expect.objectContaining({ recipientUserId: 'customer' }), expect.objectContaining({ recipientUserId: 'operator' })]) });
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), { timeout: 15_000 });
  });
  it('hides another customer booking and makes no writes', async () => {
    const { service, tx } = setup();
    tx.booking.findFirst.mockResolvedValue(null);
    await expect(service.cancel('customer', 'other-booking', { reason: 'Cancel request' })).rejects.toBeInstanceOf(NotFoundException);
    expect(tx.booking.findFirst).toHaveBeenCalledWith({ where: { id: 'other-booking', customerUserId: 'customer' }, select: { id: true, bookingStatus: true } });
    expect(tx.bookingCancellation.create).not.toHaveBeenCalled();
  });
  it.each([UserRole.STAFF, UserRole.ADMIN, UserRole.DRIVER])('denies %s at the data boundary', async (role) => {
    const { service, tx } = setup();
    tx.userProfile.findUnique.mockResolvedValue({ role, accountStatus: AccountStatus.ACTIVE });
    await expect(service.cancel('customer', 'booking', { reason: 'Cancel request' })).rejects.toBeInstanceOf(ForbiddenException);
    expect(tx.booking.findFirst).not.toHaveBeenCalled();
  });
  it.each([BookingStatus.BOOKING_REVIEW, BookingStatus.PAID_AWAITING_ASSIGNMENT, BookingStatus.DISPATCHED, BookingStatus.COMPLETED])('does not cancel %s through the unpaid path', async (bookingStatus) => {
    const { service, booking, tx } = setup(); booking.bookingStatus = bookingStatus;
    await expect(service.cancel('customer', 'booking', { reason: 'Cancel request' })).rejects.toBeInstanceOf(ConflictException);
    expect(tx.bookingCancellation.create).not.toHaveBeenCalled();
  });
  it('does not grant Customer cancellation to a driver-linked identity with a stale Customer role', async () => {
    const { service, tx } = setup();
    tx.userProfile.findUnique.mockResolvedValue({ role: UserRole.CUSTOMER, accountStatus: AccountStatus.ACTIVE, staff: { driver: { id: 'driver' } } } as never);
    await expect(service.cancel('customer', 'booking', { reason: 'Cancel request' })).rejects.toBeInstanceOf(ForbiddenException);
    expect(tx.bookingCancellation.create).not.toHaveBeenCalled();
  });
  it('rejects approved funds or assignment handoff even if the booking state is inconsistent', async () => {
    for (const gate of ['payment', 'bookingAssignment', 'assignmentRequest'] as const) {
      const { service, tx } = setup();
      if (gate === 'assignmentRequest') tx.assignmentRequest.findUnique.mockResolvedValue({ bookingId: 'booking' });
      else tx[gate].findFirst.mockResolvedValue({ id: 'existing' });
      await expect(service.cancel('customer', 'booking', { reason: 'Cancel request' })).rejects.toBeInstanceOf(ConflictException);
      expect(tx.bookingCancellation.create).not.toHaveBeenCalled();
    }
  });
  it('replays the original result and reason without duplicate notifications or transitions', async () => {
    const { service, tx, booking, cancellation } = setup();
    booking.bookingStatus = BookingStatus.CANCELLED;
    tx.bookingCancellation.findUnique.mockResolvedValue(cancellation);
    const result = await service.cancel('customer', 'booking', { reason: 'A changed retry note' });
    expect(result.reason).toBe('Original customer request');
    expect(tx.bookingCancellation.create).not.toHaveBeenCalled();
    expect(tx.bookingTransition.create).not.toHaveBeenCalled();
    expect(tx.notification.createMany).not.toHaveBeenCalled();
  });
  it('does not convert another cancellation workflow into this zero-fee result', async () => {
    const { service, tx, booking, cancellation } = setup(); booking.bookingStatus = BookingStatus.CANCELLED;
    tx.bookingCancellation.findUnique.mockResolvedValue({ ...cancellation, reviewNotes: 'another-policy' });
    await expect(service.cancel('customer', 'booking', { reason: 'Cancel request' })).rejects.toBeInstanceOf(ConflictException);
  });
  it('propagates a notification write failure so the database transaction rolls back', async () => {
    const { service, tx } = setup(); tx.notification.createMany.mockRejectedValue(new Error('Synthetic notification failure'));
    await expect(service.cancel('customer', 'booking', { reason: 'Cancel request' })).rejects.toThrow('Synthetic notification failure');
  });
});
