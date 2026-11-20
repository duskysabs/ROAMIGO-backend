import { createHmac } from 'node:crypto';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '../../src/generated/prisma/client.js';
import { BookingStatus, PaymentStatus } from '../../src/generated/prisma/enums.js';
import { PaymongoService } from '../../src/payments/paymongo.service.js';
import { createTestCheckout, getVerifiedTestPayment, PaymongoRejectedRequest } from '../../src/payments/paymongo-client.js';

vi.mock('../../src/payments/paymongo-client.js', () => ({
  testSecretKey: vi.fn(() => 'sk_test_example'),
  createTestCheckout: vi.fn(),
  getVerifiedTestPayment: vi.fn(),
  PaymongoRejectedRequest: class extends Error {},
}));

describe('PayMongo booking payment workflow', () => {
  const booking = { id: 'booking-id', customerUserId: 'customer-id', bookingStatus: BookingStatus.AWAITING_PAYMENT, finalQuotedPrice: new Prisma.Decimal('1200.00') };
  const payment = { id: 'payment-id', bookingId: booking.id, paymentStatus: PaymentStatus.PENDING, amount: booking.finalQuotedPrice, booking };
  const tx = {
    $queryRaw: vi.fn(),
    booking: { findFirst: vi.fn(), findUniqueOrThrow: vi.fn(), update: vi.fn() },
    paymongoCheckout: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), deleteMany: vi.fn() },
    paymongoWebhookEvent: { findUnique: vi.fn(), create: vi.fn() },
    payment: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    bookingTransition: { create: vi.fn() }, assignmentRequest: { create: vi.fn() },
  };
  const prisma = { ...tx, $transaction: vi.fn((fn: (client: typeof tx) => unknown) => fn(tx)) };
  const assignments = { process: vi.fn().mockResolvedValue({ status: 'PENDING' }) };
  const service = new PaymongoService(prisma as never, assignments as never);

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('PAYMONGO_TEST_SUCCESS_URL', 'https://example.com/success');
    vi.stubEnv('PAYMONGO_TEST_CANCEL_URL', 'https://example.com/cancel');
    vi.stubEnv('PAYMONGO_TEST_WEBHOOK_SECRET', 'whsk_test_example');
    tx.booking.findFirst.mockResolvedValue(booking);
    tx.booking.findUniqueOrThrow.mockResolvedValue(booking);
    tx.paymongoCheckout.findUnique.mockResolvedValue(null);
    tx.paymongoWebhookEvent.findUnique.mockResolvedValue(null);
    tx.payment.findUnique.mockResolvedValue(payment);
    vi.mocked(createTestCheckout).mockResolvedValue({ sessionId: 'cs_123', checkoutUrl: 'https://checkout.paymongo.com/cs_123' });
    vi.mocked(getVerifiedTestPayment).mockResolvedValue({ amountCentavos: 120000, currency: 'PHP' });
  });

  it('keeps checkout private to the owning customer', async () => {
    tx.booking.findFirst.mockResolvedValue(null);
    await expect(service.createCheckout('other-customer', booking.id)).rejects.toBeInstanceOf(NotFoundException);
    expect(createTestCheckout).not.toHaveBeenCalled();
  });

  it('reserves one checkout before contacting PayMongo and records the pending payment', async () => {
    await service.createCheckout(booking.customerUserId, booking.id);
    expect(tx.paymongoCheckout.create.mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(createTestCheckout).mock.invocationCallOrder[0]!);
    expect(createTestCheckout).toHaveBeenCalledWith(expect.objectContaining({ amountCentavos: 120000, bookingId: booking.id }));
    expect(tx.payment.create).toHaveBeenCalledWith({ data: expect.objectContaining({ paymentStatus: PaymentStatus.PENDING, providerReference: 'cs_123' }) });
  });

  it('clears a reservation after PayMongo definitively rejects the request', async () => {
    vi.mocked(createTestCheckout).mockRejectedValue(new PaymongoRejectedRequest('rejected'));
    await expect(service.createCheckout(booking.customerUserId, booking.id)).rejects.toThrow('rejected');
    expect(tx.paymongoCheckout.deleteMany).toHaveBeenCalledWith({ where: { bookingId: booking.id, sessionId: null } });
    expect(tx.payment.create).not.toHaveBeenCalled();
  });

  it('verifies a signed paid event and commits payment before assignment', async () => {
    tx.paymongoCheckout.findUnique.mockResolvedValue({ bookingId: booking.id, sessionId: 'cs_123' });
    const payload = Buffer.from(JSON.stringify({ data: { id: 'evt_123', attributes: {
      type: 'checkout_session.payment.paid', livemode: false, data: { id: 'cs_123' },
    } } }));
    const timestamp = Math.floor(Date.now() / 1000);
    const digest = createHmac('sha256', 'whsk_test_example').update(`${timestamp}.`).update(payload).digest('hex');
    await service.acceptWebhook(`t=${timestamp},te=${digest},li=`, payload);
    expect(tx.payment.update).toHaveBeenCalledWith({ where: { id: payment.id }, data: expect.objectContaining({ paymentStatus: PaymentStatus.PAID }) });
    expect(tx.assignmentRequest.create).toHaveBeenCalledWith({ data: { bookingId: booking.id, actorUserId: booking.customerUserId } });
    expect(assignments.process.mock.invocationCallOrder[0]).toBeGreaterThan(tx.assignmentRequest.create.mock.invocationCallOrder[0]!);
  });

  it('refuses a mismatched paid amount without changing the booking', async () => {
    tx.paymongoCheckout.findUnique.mockResolvedValue({ bookingId: booking.id, sessionId: 'cs_123' });
    vi.mocked(getVerifiedTestPayment).mockResolvedValue({ amountCentavos: 60000, currency: 'PHP' });
    const payload = Buffer.from(JSON.stringify({ data: { id: 'evt_123', attributes: {
      type: 'checkout_session.payment.paid', livemode: false, data: { id: 'cs_123' },
    } } }));
    const timestamp = Math.floor(Date.now() / 1000);
    const digest = createHmac('sha256', 'whsk_test_example').update(`${timestamp}.`).update(payload).digest('hex');
    await expect(service.acceptWebhook(`t=${timestamp},te=${digest},li=`, payload)).rejects.toBeInstanceOf(ConflictException);
    expect(tx.payment.update).not.toHaveBeenCalled();
    expect(assignments.process).not.toHaveBeenCalled();
  });
});
