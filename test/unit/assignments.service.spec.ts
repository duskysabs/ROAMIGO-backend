import { describe, expect, it, vi } from 'vitest';
import { AssignmentsService } from '../../src/assignments/assignments.service.js';
import { BookingStatus } from '../../src/generated/prisma/enums.js';

describe('Paid booking allocation', () => {
  function setup() {
    const booking = {
      id: 'booking', vehicleTypeId: 'van', passengerCount: 4,
      startDatetime: new Date('2099-01-01T08:00:00Z'), endDatetime: new Date('2099-01-01T10:00:00Z'),
      createdAt: new Date('2098-12-01'), bookingStatus: BookingStatus.PAID_AWAITING_ASSIGNMENT,
      finalQuotedPrice: '1200.00', outsourcedDetails: null,
    };
    const request = { bookingId: booking.id, actorUserId: 'verifier', completedAt: null, booking };
    const tx = {
      $queryRaw: vi.fn(),
      assignmentRequest: { findUnique: vi.fn().mockResolvedValue(request), findFirst: vi.fn().mockResolvedValue(null), update: vi.fn() },
      payment: { findFirst: vi.fn().mockResolvedValue({ id: 'paid-receipt' }) },
      vehicle: { findMany: vi.fn().mockResolvedValue([{ id: 'vehicle' }]), findFirst: vi.fn().mockResolvedValue({ id: 'vehicle', assignedDriverId: 'driver' }) },
      bookingAssignment: { create: vi.fn() }, booking: { update: vi.fn() }, bookingTransition: { create: vi.fn() },
    };
    const prisma = { $transaction: vi.fn((callback: (client: typeof tx) => unknown) => callback(tx)) };
    return { service: new AssignmentsService(prisma as never), tx, prisma, booking, request };
  }

  it('creates one interval-bound assignment and confirms only after allocation', async () => {
    const { service, tx, booking } = setup();
    await expect(service.process('booking')).resolves.toEqual({ bookingId: 'booking', status: 'ASSIGNED', reason: null });
    expect(tx.bookingAssignment.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      vehicleId: 'vehicle', driverId: 'driver', reservedFrom: booking.startDatetime, reservedUntil: booking.endDatetime,
    }) });
    expect(tx.booking.update).toHaveBeenCalledWith({ where: { id: 'booking' }, data: { bookingStatus: BookingStatus.CONFIRMED } });
    expect(tx.bookingAssignment.create.mock.invocationCallOrder[0]).toBeLessThan(tx.booking.update.mock.invocationCallOrder[0]!);
  });

  it('keeps a paid booking pending when capacity has disappeared', async () => {
    const { service, tx } = setup();
    tx.vehicle.findMany.mockResolvedValue([]);
    await expect(service.process('booking')).resolves.toMatchObject({ status: 'PENDING', reason: 'NO_ELIGIBLE_PAIR' });
    expect(tx.booking.update).not.toHaveBeenCalled();
    expect(tx.assignmentRequest.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ lastFailure: 'NO_ELIGIBLE_PAIR' }) }));
  });

  it('waits for an older overlapping paid request', async () => {
    const { service, tx } = setup();
    tx.assignmentRequest.findFirst.mockResolvedValue({ bookingId: 'earlier' } as never);
    await expect(service.process('booking')).resolves.toMatchObject({ status: 'PENDING', reason: 'EARLIER_PAID_BOOKING_PENDING' });
    expect(tx.vehicle.findMany).not.toHaveBeenCalled();
  });

  it('does not allocate an outsourced offer to an internal pair', async () => {
    const { service, tx, request, booking } = setup();
    tx.assignmentRequest.findUnique.mockResolvedValue({ ...request, booking: { ...booking, outsourcedDetails: { id: 'offer' } } } as never);
    await expect(service.process('booking')).resolves.toMatchObject({ status: 'PENDING', reason: 'OUTSOURCED_FULFILMENT_REQUIRES_REVIEW' });
    expect(tx.bookingAssignment.create).not.toHaveBeenCalled();
  });

  it('rechecks eligibility after locking candidate readiness', async () => {
    const { service, tx } = setup();
    tx.vehicle.findFirst.mockResolvedValue(null as never);
    await expect(service.process('booking')).resolves.toMatchObject({ status: 'PENDING', reason: 'NO_ELIGIBLE_PAIR' });
    expect(tx.bookingAssignment.create).not.toHaveBeenCalled();
  });

  it('does not recreate a completed assignment request', async () => {
    const { service, tx, request } = setup();
    tx.assignmentRequest.findUnique.mockResolvedValue({ ...request, completedAt: new Date() } as never);
    await expect(service.process('booking')).resolves.toMatchObject({ status: 'ASSIGNED' });
    expect(tx.bookingAssignment.create).not.toHaveBeenCalled();
  });

  it('returns a retryable result when an exclusion constraint or database operation fails', async () => {
    const { service, tx } = setup();
    tx.bookingAssignment.create.mockRejectedValue({ code: 'P2004' });
    await expect(service.process('booking')).resolves.toMatchObject({ status: 'PENDING', reason: 'RETRY_REQUIRED' });
    expect(tx.booking.update).not.toHaveBeenCalled();
  });

  it('requires an authoritative full payment even for a pending allocation request', async () => {
    const { service, tx } = setup();
    tx.payment.findFirst.mockResolvedValue(null as never);
    await expect(service.process('booking')).resolves.toMatchObject({ status: 'PENDING', reason: 'FULL_PAYMENT_REQUIRED' });
    expect(tx.bookingAssignment.create).not.toHaveBeenCalled();
  });
});
