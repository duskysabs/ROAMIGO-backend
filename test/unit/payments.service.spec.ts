import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { Prisma } from '../../src/generated/prisma/client.js';
import { AccountStatus, BookingStatus, EmploymentStatus, PaymentChannel, PaymentMethod, PaymentStatus, UserRole } from '../../src/generated/prisma/enums.js';
import { PaymentsService } from '../../src/payments/payments.service.js';

describe('Manual payment recording and review', () => {
  function setup() {
    const booking = { id: 'booking', finalQuotedPrice: new Prisma.Decimal('1200.00'), bookingStatus: BookingStatus.AWAITING_PAYMENT };
    const current = { id: 'payment', bookingId: 'booking', amount: new Prisma.Decimal('1200.00'), currency: 'PHP', paymentChannel: PaymentChannel.MANUAL, paymentStatus: PaymentStatus.PENDING, booking };
    const tx = {
      $queryRaw: vi.fn(),
      userProfile: { findUnique: vi.fn().mockResolvedValue({ role: UserRole.ADMIN, accountStatus: AccountStatus.ACTIVE, staff: null }) },
      booking: { findUnique: vi.fn().mockResolvedValue(booking), update: vi.fn() },
      payment: {
        findUnique: vi.fn().mockResolvedValue(current), findUniqueOrThrow: vi.fn().mockResolvedValue(current),
        create: vi.fn().mockResolvedValue(current), update: vi.fn().mockResolvedValue({ ...current, paymentStatus: PaymentStatus.PAID }), findMany: vi.fn(),
      },
      bookingTransition: { create: vi.fn() }, assignmentRequest: { create: vi.fn() },
    };
    const prisma = { ...tx, $transaction: vi.fn((callback: (client: typeof tx) => unknown) => callback(tx)) };
    const assignments = { process: vi.fn().mockResolvedValue({ status: 'PENDING', reason: 'NO_ELIGIBLE_PAIR' }) };
    return { service: new PaymentsService(prisma as never, assignments as never), tx, prisma, assignments, current, booking };
  }

  it('commits paid evidence and a durable request before attempting allocation', async () => {
    const { service, tx, assignments } = setup();
    const result = await service.review('admin', 'payment', true, { reason: 'Receipt checked against bank statement' });
    expect(result.payment.paymentStatus).toBe(PaymentStatus.PAID);
    expect(result.assignment?.status).toBe('PENDING');
    expect(tx.assignmentRequest.create).toHaveBeenCalledWith({ data: { bookingId: 'booking', actorUserId: 'admin' } });
    expect(tx.booking.update).toHaveBeenCalledWith({ where: { id: 'booking' }, data: { bookingStatus: BookingStatus.PAID_AWAITING_ASSIGNMENT } });
    expect(tx.payment.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
      audits: { create: expect.objectContaining({ actorUserId: 'admin', actorRole: UserRole.ADMIN, action: 'DECIDED', reason: 'Receipt checked against bank statement' }) },
    }) }));
    expect(assignments.process.mock.invocationCallOrder[0]).toBeGreaterThan(tx.assignmentRequest.create.mock.invocationCallOrder[0]!);
  });

  it('does not confirm a partial payment or enqueue allocation', async () => {
    const { service, tx, current } = setup();
    tx.payment.findUnique.mockResolvedValue({ ...current, amount: new Prisma.Decimal('600.00') });
    await expect(service.review('admin', 'payment', true, { reason: 'Check amount' })).rejects.toBeInstanceOf(ConflictException);
    expect(tx.payment.update).not.toHaveBeenCalled();
    expect(tx.assignmentRequest.create).not.toHaveBeenCalled();
  });

  it('rejects pending evidence without changing booking or assignment', async () => {
    const { service, tx, assignments } = setup();
    tx.payment.update.mockResolvedValue({ id: 'payment', bookingId: 'booking', paymentStatus: PaymentStatus.FAILED } as never);
    await service.review('admin', 'payment', false, { reason: 'Receipt not found' });
    expect(tx.booking.update).not.toHaveBeenCalled();
    expect(assignments.process).not.toHaveBeenCalled();
  });

  it('treats repeated approval as a retry without duplicating audit or request', async () => {
    const { service, tx, current } = setup();
    tx.payment.findUnique.mockResolvedValue({ ...current, paymentStatus: PaymentStatus.PAID });
    tx.payment.findUniqueOrThrow.mockResolvedValue({ ...current, paymentStatus: PaymentStatus.PAID });
    await service.review('admin', 'payment', true, { reason: 'Retry receipt check' });
    expect(tx.payment.update).not.toHaveBeenCalled();
    expect(tx.assignmentRequest.create).not.toHaveBeenCalled();
  });

  it('rejects a conflicting decision for a resolved receipt', async () => {
    const { service, tx, current } = setup();
    tx.payment.findUnique.mockResolvedValue({ ...current, paymentStatus: PaymentStatus.FAILED });
    await expect(service.review('admin', 'payment', true, { reason: 'Changed decision' })).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects inactive employment even if the account is active', async () => {
    const { service, tx } = setup();
    tx.userProfile.findUnique.mockResolvedValue({ role: UserRole.STAFF, accountStatus: AccountStatus.ACTIVE, staff: { employmentStatus: EmploymentStatus.SUSPENDED } } as never);
    await expect(service.review('staff', 'payment', true, { reason: 'Check receipt' })).rejects.toBeInstanceOf(ForbiddenException);
    expect(tx.payment.update).not.toHaveBeenCalled();
  });

  it('allows active non-driver Staff to verify received funds', async () => {
    const { service, tx } = setup();
    tx.userProfile.findUnique.mockResolvedValue({ role: UserRole.STAFF, accountStatus: AccountStatus.ACTIVE, staff: { id: 'staff', employmentStatus: EmploymentStatus.ACTIVE, driver: null } } as never);
    await expect(service.review('staff', 'payment', true, { reason: 'Receipt checked' })).resolves.toMatchObject({ payment: { paymentStatus: PaymentStatus.PAID } });
  });

  it('excludes driver-linked Staff from payment verification', async () => {
    const { service, tx } = setup();
    tx.userProfile.findUnique.mockResolvedValue({ role: UserRole.STAFF, accountStatus: AccountStatus.ACTIVE, staff: { employmentStatus: EmploymentStatus.ACTIVE, driver: { id: 'driver' } } } as never);
    await expect(service.review('driver-user', 'payment', true, { reason: 'Receipt checked' })).rejects.toBeInstanceOf(ForbiddenException);
    expect(tx.payment.update).not.toHaveBeenCalled();
  });

  it('records only the full price and keeps the payment pending', async () => {
    const { service, tx } = setup();
    tx.payment.findUnique.mockResolvedValue(null as never);
    await service.record('admin', 'booking', { method: PaymentMethod.BANK_TRANSFER, reference: 'bank-123', amount: '1200.00', reason: 'Receipt entered' });
    expect(tx.payment.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
      paymentStatus: PaymentStatus.PENDING, providerReference: 'BANK-123', currency: 'PHP',
    }) }));
    expect(tx.booking.update).not.toHaveBeenCalled();
  });

  it('rejects an underpayment at recording', async () => {
    const { service, tx } = setup();
    tx.payment.findUnique.mockResolvedValue(null as never);
    await expect(service.record('admin', 'booking', { method: PaymentMethod.CASH, reference: 'CASH-1', amount: '100.00', reason: 'Cash received' })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects zero-value receipts before accessing persistence', async () => {
    const { service, tx } = setup();
    await expect(service.record('admin', 'booking', { method: PaymentMethod.CASH, reference: 'CASH-0', amount: '0.00', reason: 'No funds received' })).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.payment.create).not.toHaveBeenCalled();
  });

  it('rejects a receipt reference already attached to another booking', async () => {
    const { service } = setup();
    await expect(service.record('admin', 'another-booking', { method: PaymentMethod.CASH, reference: 'CASH-1', amount: '1200.00', reason: 'Cash received' })).rejects.toBeInstanceOf(ConflictException);
  });

  it('hides payment reads for another customer booking', async () => {
    const { service, prisma } = setup();
    const findFirst = vi.fn().mockResolvedValue(null);
    Object.assign(prisma.booking, { findFirst });
    await expect(service.listMine('customer', 'other-booking')).rejects.toBeInstanceOf(NotFoundException);
    expect(findFirst).toHaveBeenCalledWith({ where: { id: 'other-booking', customerUserId: 'customer' }, select: { id: true } });
  });
});
